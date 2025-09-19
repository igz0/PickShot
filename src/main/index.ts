import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { type Locale, isLocale, resolveLocale, translate } from "@shared/i18n";
import type {
  DeletePhotoResult,
  PhotoCollectionPayload,
  PhotoMeta,
  RatingUpdatePayload,
  RatingUpdateResult,
  RenamePhotoPayload,
  RenamePhotoResult,
  RevealPhotoResult,
} from "@shared/types";
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  session,
  shell,
} from "electron";
import sharp from "sharp";
import {
  deleteRating,
  getAllRatings,
  initRatingsStore,
  renameRating,
  upsertRating,
} from "./db/ratingsStore";
import type { RatingCacheEntry } from "./db/ratingsStore";
import {
  clampRating,
  isMetadataEnabled,
  readRatingFromMetadata,
  writeRatingToMetadata,
} from "./metadata/ratingMetadata";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "photo",
    privileges: {
      secure: true,
      standard: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
  {
    scheme: "photo-thumb",
    privileges: {
      secure: true,
      standard: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

// Supported image extensions for illustration/photo workflows
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tiff",
  "tif",
  "svg",
  "avif",
]);

const MIME_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  svg: "image/svg+xml",
  avif: "image/avif",
};

const THUMBNAIL_SCHEME = "photo-thumb";
const THUMBNAIL_BASE_WIDTH = 320;
const THUMBNAIL_RETINA_WIDTH = 480;
const THUMBNAIL_QUALITY = 80;
const THUMBNAIL_JOB_CONCURRENCY = 2;

let cachedThumbnailDir: string | null = null;

function normalizeTimestamp(value: number): number {
  return Math.trunc(value);
}

interface ThumbnailJob {
  filePath: string;
  basePath: string;
  retinaPath: string;
  sourceModifiedAt: number;
}

const thumbnailQueue: ThumbnailJob[] = [];
const enqueuedThumbnailTargets = new Set<string>();
let activeThumbnailJobs = 0;

const windows = new Set<BrowserWindow>();
let currentLocale: Locale = resolveLocale(app.getLocale());

function broadcastRatingsRefreshed(updates: Record<string, number>): void {
  if (!updates || Object.keys(updates).length === 0) {
    return;
  }

  for (const win of windows) {
    if (win.isDestroyed()) {
      continue;
    }
    win.webContents.send("ratings:refreshed", { ratings: updates });
  }
}

function getThumbnailDir(): string {
  if (!cachedThumbnailDir) {
    cachedThumbnailDir = join(app.getPath("userData"), "thumbnails");
  }

  return cachedThumbnailDir;
}

async function ensureThumbnailDir(): Promise<string> {
  const directory = getThumbnailDir();
  await mkdir(directory, { recursive: true });
  return directory;
}

function buildProtocolUrl(scheme: string, filePath: string): string {
  const fileUrl = pathToFileURL(filePath);
  return `${scheme}://local${fileUrl.pathname}`;
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection in main process:", reason);
});

async function ensurePhotoProtocol() {
  const ses = session.defaultSession;
  const handled = await ses.protocol.isProtocolHandled("photo");
  if (handled) {
    return;
  }

  ses.protocol.registerStreamProtocol("photo", (request, callback) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      if (process.platform === "win32" && filePath.startsWith("/")) {
        filePath = filePath.slice(1);
      }

      const stream = createReadStream(filePath);
      stream.on("error", (error) => {
        console.error(
          "Failed to stream file for photo protocol",
          error,
          filePath,
        );
        callback({ statusCode: 404 });
      });

      stream.once("open", () => {
        const ext = extname(filePath).slice(1).toLowerCase();
        const mimeType = MIME_TYPE_BY_EXT[ext] ?? "application/octet-stream";

        callback({
          statusCode: 200,
          headers: {
            "Content-Type": mimeType,
          },
          data: stream,
        });
      });
    } catch (error) {
      console.error("Failed to handle photo protocol", error);
      callback({ error: -6 });
    }
  });
}

async function ensureThumbnailProtocol() {
  const ses = session.defaultSession;
  const handled = await ses.protocol.isProtocolHandled(THUMBNAIL_SCHEME);
  if (handled) {
    return;
  }

  ses.protocol.registerStreamProtocol(THUMBNAIL_SCHEME, (request, callback) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      if (process.platform === "win32" && filePath.startsWith("/")) {
        filePath = filePath.slice(1);
      }

      const stream = createReadStream(filePath);
      stream.on("error", (error) => {
        console.error(
          "Failed to stream file for thumbnail protocol",
          error,
          filePath,
        );
        callback({ statusCode: 404 });
      });

      stream.once("open", () => {
        callback({
          statusCode: 200,
          headers: {
            "Content-Type": "image/webp",
          },
          data: stream,
        });
      });
    } catch (error) {
      console.error("Failed to handle thumbnail protocol", error);
      callback({ error: -6 });
    }
  });
}

async function isThumbnailFresh(
  targetPath: string,
  sourceModifiedAt: number,
): Promise<boolean> {
  try {
    const info = await stat(targetPath);
    return info.mtimeMs >= sourceModifiedAt;
  } catch (error) {
    return false;
  }
}

async function resolveThumbnailState(
  filePath: string,
  sourceModifiedAt: number,
): Promise<{
  basePath: string;
  retinaPath: string;
  baseFresh: boolean;
  retinaFresh: boolean;
}> {
  const directory = await ensureThumbnailDir();
  const hash = createHash("sha1").update(filePath).digest("hex");
  const basePath = join(directory, `${hash}-w${THUMBNAIL_BASE_WIDTH}.webp`);
  const retinaPath = join(directory, `${hash}-w${THUMBNAIL_RETINA_WIDTH}.webp`);
  const [baseFresh, retinaFresh] = await Promise.all([
    isThumbnailFresh(basePath, sourceModifiedAt),
    isThumbnailFresh(retinaPath, sourceModifiedAt),
  ]);

  return { basePath, retinaPath, baseFresh, retinaFresh };
}

function scheduleThumbnailGeneration(job: ThumbnailJob): void {
  if (enqueuedThumbnailTargets.has(job.basePath)) {
    return;
  }
  enqueuedThumbnailTargets.add(job.basePath);
  thumbnailQueue.push(job);
  processThumbnailQueue();
}

function processThumbnailQueue(): void {
  while (
    activeThumbnailJobs < THUMBNAIL_JOB_CONCURRENCY &&
    thumbnailQueue.length > 0
  ) {
    const job = thumbnailQueue.shift();
    if (!job) {
      break;
    }
    activeThumbnailJobs += 1;
    runThumbnailJob(job)
      .catch((error) => {
        console.error("Failed to generate thumbnail", job.filePath, error);
      })
      .finally(() => {
        enqueuedThumbnailTargets.delete(job.basePath);
        activeThumbnailJobs -= 1;
        processThumbnailQueue();
      });
  }
}

async function runThumbnailJob(job: ThumbnailJob): Promise<void> {
  const { filePath, basePath, retinaPath, sourceModifiedAt } = job;

  const [baseFresh, retinaFresh] = await Promise.all([
    isThumbnailFresh(basePath, sourceModifiedAt),
    isThumbnailFresh(retinaPath, sourceModifiedAt),
  ]);

  const tasks: Array<Promise<sharp.OutputInfo>> = [];
  const pipeline = sharp(filePath).rotate();

  if (!baseFresh) {
    tasks.push(
      pipeline
        .clone()
        .resize({
          width: THUMBNAIL_BASE_WIDTH,
          withoutEnlargement: true,
        })
        .webp({
          quality: THUMBNAIL_QUALITY,
          effort: 4,
        })
        .toFile(basePath),
    );
  }

  if (!retinaFresh) {
    tasks.push(
      pipeline
        .clone()
        .resize({
          width: THUMBNAIL_RETINA_WIDTH,
          withoutEnlargement: true,
        })
        .webp({
          quality: THUMBNAIL_QUALITY,
          effort: 4,
        })
        .toFile(retinaPath),
    );
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  const [baseReady, retinaReady] = await Promise.all([
    isThumbnailFresh(basePath, sourceModifiedAt),
    isThumbnailFresh(retinaPath, sourceModifiedAt),
  ]);

  if (!baseReady) {
    return;
  }

  const thumbnailUrl = buildProtocolUrl(THUMBNAIL_SCHEME, basePath);
  const retinaUrl = retinaReady
    ? buildProtocolUrl(THUMBNAIL_SCHEME, retinaPath)
    : thumbnailUrl;

  for (const win of windows) {
    if (win.isDestroyed()) {
      continue;
    }
    win.webContents.send("thumbnails:ready", {
      id: filePath,
      thumbnailUrl,
      thumbnailRetinaUrl: retinaUrl,
    });
  }
}

async function collectPhotos(root: string): Promise<PhotoMeta[]> {
  const stack: string[] = [root];
  const items: PhotoMeta[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      // Skip directories we cannot read
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        // Skip hidden files/directories to avoid noise
        continue;
      }

      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = entry.name.split(".").pop();
      if (!ext || !IMAGE_EXTENSIONS.has(ext.toLowerCase())) {
        continue;
      }

      try {
        const info = await stat(fullPath);
        const fileUrl = pathToFileURL(fullPath);
        const fileUrlString = `photo://local${fileUrl.pathname}`;
        const { basePath, retinaPath, baseFresh, retinaFresh } =
          await resolveThumbnailState(fullPath, info.mtimeMs);

        if (!baseFresh || !retinaFresh) {
          scheduleThumbnailGeneration({
            filePath: fullPath,
            basePath,
            retinaPath,
            sourceModifiedAt: info.mtimeMs,
          });
        }

        const thumbnailUrl = baseFresh
          ? buildProtocolUrl(THUMBNAIL_SCHEME, basePath)
          : fileUrlString;
        const thumbnailRetinaUrl = retinaFresh
          ? buildProtocolUrl(THUMBNAIL_SCHEME, retinaPath)
          : thumbnailUrl;
        items.push({
          id: fullPath,
          name: entry.name,
          filePath: fullPath,
          fileUrl: fileUrlString,
          thumbnailUrl,
          thumbnailRetinaUrl,
          size: info.size,
          modifiedAt: info.mtimeMs,
        });
      } catch (error) {
        // Ignore unreadable files
      }
    }
  }

  return items;
}

async function refreshRatingsInBackground(
  photos: PhotoMeta[],
  cachedRatings: Record<string, RatingCacheEntry>,
): Promise<void> {
  if (!photos.length) {
    return;
  }

  for (const photo of photos) {
    if (!isMetadataEnabled()) {
      break;
    }

    const cached = cachedRatings[photo.id];
    const previousRating = cached?.rating ?? 0;

    try {
      if (cached && cached.sourceModifiedAt == null && cached.rating > 0) {
        const normalized = clampRating(cached.rating);
        await writeRatingToMetadata(photo.filePath, normalized);
        const info = await stat(photo.filePath);
        const modifiedAt = normalizeTimestamp(info.mtimeMs);
        photo.modifiedAt = modifiedAt;
        photo.size = info.size;
        upsertRating(photo.id, normalized, modifiedAt);
        if (previousRating !== normalized) {
          broadcastRatingsRefreshed({ [photo.id]: normalized });
        }
        continue;
      }

      const metadataRating = await readRatingFromMetadata(photo.filePath);
      const normalized =
        typeof metadataRating === "number" ? clampRating(metadataRating) : 0;
      upsertRating(photo.id, normalized, normalizeTimestamp(photo.modifiedAt));
      if (previousRating !== normalized) {
        broadcastRatingsRefreshed({ [photo.id]: normalized });
      }
    } catch (error) {
      console.error("Failed to refresh rating metadata", photo.filePath, error);
    }
  }
}

async function createWindow() {
  const preloadCandidates = [
    join(__dirname, "../preload/index.js"),
    join(__dirname, "../preload/index.mjs"),
    join(__dirname, "../preload/index.cjs"),
  ];
  const preloadScript = preloadCandidates.find((candidate) =>
    existsSync(candidate),
  );

  if (!preloadScript) {
    throw new Error(
      "Preload script not found in dist/preload. Build step may have failed.",
    );
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1e1e1e" : "#f5f5f5",
    webPreferences: {
      preload: preloadScript,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
    show: false,
  });

  windows.add(win);

  win.on("closed", () => {
    windows.delete(win);
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await ensurePhotoProtocol();
  await ensureThumbnailProtocol();
  try {
    initRatingsStore();
  } catch (error) {
    dialog.showErrorBox(
      translate(currentLocale, "main.sqliteError.title"),
      translate(currentLocale, "main.sqliteError.message"),
    );
    throw error;
  }

  ipcMain.handle(
    "app:get-locale",
    async (): Promise<{ locale: Locale }> => ({ locale: currentLocale }),
  );

  ipcMain.handle("app:set-locale", async (_event, value: string) => {
    if (isLocale(value)) {
      currentLocale = value;
    }
  });

  ipcMain.handle(
    "photos:select-folder",
    async (): Promise<PhotoCollectionPayload> => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
      });

      if (result.canceled || !result.filePaths.length) {
        return {
          directory: null,
          photos: [] as PhotoMeta[],
          ratings: {},
        };
      }

      const directory = result.filePaths[0];
      const photos = await collectPhotos(directory);

      const cachedRatings: Record<string, RatingCacheEntry> = getAllRatings();
      const ratings: Record<string, number> = {};
      const needsRefresh: PhotoMeta[] = [];

      for (const photo of photos) {
        const cached = cachedRatings[photo.id];
        if (
          cached &&
          typeof cached.sourceModifiedAt === "number" &&
          cached.sourceModifiedAt === photo.modifiedAt
        ) {
          if (cached.rating > 0) {
            ratings[photo.id] = cached.rating;
          }
          continue;
        }

        if (cached && cached.rating > 0) {
          ratings[photo.id] = cached.rating;
        }
        needsRefresh.push(photo);
      }

      void refreshRatingsInBackground(needsRefresh, cachedRatings);

      return { directory, photos, ratings };
    },
  );

  ipcMain.handle(
    "photos:delete",
    async (_event, filePath: string): Promise<DeletePhotoResult> => {
      try {
        await shell.trashItem(filePath);
        deleteRating(filePath);
        return { success: true };
      } catch (error) {
        console.error("Failed to move photo to trash", filePath, error);
        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : translate(currentLocale, "app.error.unknown"),
        };
      }
    },
  );

  ipcMain.handle(
    "photos:rename",
    async (_event, payload: RenamePhotoPayload): Promise<RenamePhotoResult> => {
      const { filePath, newName } = payload;
      try {
        if (!existsSync(filePath)) {
          return {
            success: false,
            message: translate(currentLocale, "app.error.fileNotFound"),
          };
        }

        const currentName = basename(filePath);
        const sanitized = newName.trim();
        if (!sanitized) {
          return {
            success: false,
            message: translate(currentLocale, "app.error.renameEmpty"),
          };
        }
        if (sanitized === "." || sanitized === "..") {
          return {
            success: false,
            message: translate(currentLocale, "app.error.renameInvalid"),
          };
        }
        if (/[\\/]/.test(sanitized)) {
          return {
            success: false,
            message: translate(
              currentLocale,
              "app.error.renameForbiddenCharacters",
            ),
          };
        }

        const directory = dirname(filePath);
        const targetPath = join(directory, sanitized);
        const sameNameInsensitive =
          sanitized.localeCompare(currentName, undefined, {
            sensitivity: "accent",
          }) === 0;
        if (
          existsSync(targetPath) &&
          targetPath !== filePath &&
          !sameNameInsensitive
        ) {
          return {
            success: false,
            message: translate(currentLocale, "app.error.renameConflict"),
          };
        }

        let resultPath = filePath;
        if (targetPath !== filePath) {
          await rename(filePath, targetPath);
          renameRating(filePath, targetPath);
          resultPath = targetPath;
        }

        const info = await stat(resultPath);
        const fileUrl = pathToFileURL(resultPath);
        const fileUrlString = `photo://local${fileUrl.pathname}`;
        const { basePath, retinaPath, baseFresh, retinaFresh } =
          await resolveThumbnailState(resultPath, info.mtimeMs);

        if (!baseFresh || !retinaFresh) {
          scheduleThumbnailGeneration({
            filePath: resultPath,
            basePath,
            retinaPath,
            sourceModifiedAt: info.mtimeMs,
          });
        }

        const thumbnailUrl = baseFresh
          ? buildProtocolUrl(THUMBNAIL_SCHEME, basePath)
          : fileUrlString;
        const thumbnailRetinaUrl = retinaFresh
          ? buildProtocolUrl(THUMBNAIL_SCHEME, retinaPath)
          : thumbnailUrl;
        const photo: PhotoMeta = {
          id: resultPath,
          name: basename(resultPath),
          filePath: resultPath,
          fileUrl: fileUrlString,
          thumbnailUrl,
          thumbnailRetinaUrl,
          size: info.size,
          modifiedAt: info.mtimeMs,
        };

        return {
          success: true,
          photo,
        };
      } catch (error) {
        console.error("Failed to rename photo", payload, error);
        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : translate(currentLocale, "app.error.unknown"),
        };
      }
    },
  );

  ipcMain.handle(
    "photos:reveal",
    async (_event, filePath: string): Promise<RevealPhotoResult> => {
      try {
        if (!existsSync(filePath)) {
          return {
            success: false,
            message: translate(currentLocale, "app.error.revealNotFound"),
          };
        }
        shell.showItemInFolder(filePath);
        return { success: true };
      } catch (error) {
        console.error("Failed to reveal photo in folder", filePath, error);
        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : translate(currentLocale, "app.error.unknown"),
        };
      }
    },
  );

  ipcMain.handle(
    "ratings:update",
    async (
      _event,
      payload: RatingUpdatePayload,
    ): Promise<RatingUpdateResult> => {
      try {
        if (payload.rating > 0) {
          upsertRating(payload.id, payload.rating);
        } else {
          deleteRating(payload.id);
        }
        return { success: true };
      } catch (error) {
        console.error("Failed to update rating", payload, error);
        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : translate(currentLocale, "app.error.unknown"),
        };
      }
    },
  );

  createWindow().catch((error) => {
    console.error("Failed to create window", error);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        console.error("Failed to create window", error);
        app.quit();
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import {
  type Locale,
  defaultLocale,
  isLocale,
  resolveLocale,
  translate,
} from "@shared/i18n";
import type {
  DeletePhotoResult,
  OpenDirectoryResult,
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
import type { JpegOptions } from "sharp";
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
  "heic",
  "heif",
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
  heic: "image/heic",
  heif: "image/heif",
};

const THUMBNAIL_SCHEME = "photo-thumb";
const THUMBNAIL_BASE_WIDTH = 320;
const THUMBNAIL_RETINA_WIDTH = 480;
const THUMBNAIL_QUALITY = 80;
const THUMBNAIL_JOB_CONCURRENCY = 2;

let cachedThumbnailDir: string | null = null;
let cachedMediaCacheDir: string | null = null;

interface MediaTranscodeRule {
  preferSharp: boolean;
  fallback?: "heic-convert";
  format: "jpeg";
  mime: string;
  extension: string;
  options?: JpegOptions;
}

const MEDIA_TRANSCODE_RULES: Record<string, MediaTranscodeRule> = {
  heic: {
    preferSharp: true,
    fallback: "heic-convert",
    format: "jpeg",
    mime: "image/jpeg",
    extension: "jpg",
    options: {
      quality: 92,
      mozjpeg: true,
    },
  },
  heif: {
    preferSharp: true,
    fallback: "heic-convert",
    format: "jpeg",
    mime: "image/jpeg",
    extension: "jpg",
    options: {
      quality: 92,
      mozjpeg: true,
    },
  },
};

const mediaTranscodeTasks = new Map<string, Promise<string>>();
let heicSharpDecodeAvailable: boolean | null = null;

interface HeicWorkerRequest {
  id: number;
  filePath: string;
  targetPath: string;
  quality: number;
}

interface HeicWorkerResponse {
  id: number;
  status: "ok" | "error";
  error?: {
    message: string;
    code?: string;
  };
}

let heicWorker: Worker | null = null;
const heicWorkerTasks = new Map<
  number,
  {
    resolve: () => void;
    reject: (error: unknown) => void;
  }
>();
let heicWorkerRequestId = 0;

function isHeicDecodePluginError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no decoding plugin installed") ||
    normalized.includes("bad seek") ||
    normalized.includes("no decoding plugin for this compression format")
  );
}

function serializeWorkerError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const err = new Error(
    typeof error === "object" && error
      ? JSON.stringify(error)
      : String(error ?? "Unknown worker error"),
  );
  return err;
}

function rejectAllHeicWorkerTasks(error: unknown): void {
  const rejection = serializeWorkerError(error);
  for (const task of heicWorkerTasks.values()) {
    task.reject(rejection);
  }
  heicWorkerTasks.clear();
}

async function ensureHeicWorker(): Promise<Worker> {
  if (heicWorker) {
    return heicWorker;
  }

  const workerScript = new URL("./media/heicWorker.js", import.meta.url);
  const worker = new Worker(workerScript, { type: "module" });

  worker.on("message", (payload: HeicWorkerResponse) => {
    const pending = heicWorkerTasks.get(payload.id);
    if (!pending) {
      return;
    }
    heicWorkerTasks.delete(payload.id);
    if (payload.status === "ok") {
      pending.resolve();
      return;
    }
    const error = new Error(payload.error?.message ?? "HEIC transcode failed");
    if (payload.error?.code) {
      (error as NodeJS.ErrnoException).code = payload.error.code;
    }
    pending.reject(error);
  });

  worker.on("error", (error) => {
    rejectAllHeicWorkerTasks(error);
    heicWorker = null;
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      rejectAllHeicWorkerTasks(
        new Error(`HEIC worker exited unexpectedly with code ${code}`),
      );
    }
    heicWorker = null;
  });

  worker.unref();
  heicWorker = worker;
  return worker;
}

async function transcodeHeicWithWorker(
  filePath: string,
  targetPath: string,
  quality: number,
): Promise<void> {
  const worker = await ensureHeicWorker();
  const id = ++heicWorkerRequestId;
  return new Promise((resolve, reject) => {
    heicWorkerTasks.set(id, { resolve, reject });
    const payload: HeicWorkerRequest = {
      id,
      filePath,
      targetPath,
      quality,
    };
    worker.postMessage(payload);
  });
}

async function ensureTranscodedMediaAsset(
  filePath: string,
  sourceModifiedAt: number,
  rule: MediaTranscodeRule,
): Promise<string> {
  const directory = await ensureMediaCacheDir();
  const hash = createHash("sha1").update(filePath).digest("hex");
  const targetPath = join(directory, `${hash}.${rule.extension}`);

  if (await isCacheEntryFresh(targetPath, sourceModifiedAt)) {
    return targetPath;
  }

  const existingTask = mediaTranscodeTasks.get(targetPath);
  if (existingTask) {
    try {
      await existingTask;
    } catch (error) {
      // Ignore task failure here; a new attempt will run below
    }
    if (await isCacheEntryFresh(targetPath, sourceModifiedAt)) {
      return targetPath;
    }
  }

  const conversionTask = (async () => {
    try {
      let preferSharp = rule.preferSharp;
      if (
        preferSharp &&
        rule.fallback === "heic-convert" &&
        heicSharpDecodeAvailable === false
      ) {
        preferSharp = false;
      }

      let hadSharpError = false;

      if (preferSharp) {
        try {
          const pipeline = sharp(filePath).rotate();
          if (rule.format === "jpeg") {
            pipeline.jpeg(rule.options ?? {});
          } else {
            throw new Error(`Unsupported transcode format: ${rule.format}`);
          }

          await pipeline.toFile(targetPath);

          if (rule.fallback === "heic-convert") {
            heicSharpDecodeAvailable = true;
          }

          return targetPath;
        } catch (error) {
          if (
            rule.fallback === "heic-convert" &&
            isHeicDecodePluginError(error)
          ) {
            heicSharpDecodeAvailable = false;
            hadSharpError = true;
          } else {
            throw error;
          }
        }
      }

      if (rule.fallback === "heic-convert") {
        await transcodeHeicWithWorker(
          filePath,
          targetPath,
          rule.options?.quality ?? 92,
        );
        return targetPath;
      }

      if (hadSharpError) {
        throw new Error(`Failed to transcode ${filePath} via fallback`);
      }

      throw new Error(`No available transcode strategy for ${filePath}`);
    } catch (error) {
      await unlink(targetPath).catch(() => {
        // stale cache file is best-effort cleanup
      });
      throw error;
    }
  })();

  mediaTranscodeTasks.set(targetPath, conversionTask);
  try {
    await conversionTask;
  } finally {
    mediaTranscodeTasks.delete(targetPath);
  }

  if (!(await isCacheEntryFresh(targetPath, sourceModifiedAt))) {
    throw new Error(`Failed to prepare media cache for ${filePath}`);
  }

  return targetPath;
}

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

// Prefer the user's OS language list to avoid defaulting to English when
// Electron lacks bundled locale data (e.g. Japanese Windows without ja.pak).
function detectInitialLocale(): Locale {
  const candidates: Array<string | null | undefined> = [];

  if (typeof app.getPreferredSystemLanguages === "function") {
    const preferred = app.getPreferredSystemLanguages();
    if (Array.isArray(preferred)) {
      candidates.push(...preferred);
    }
  }

  candidates.push(
    app.getLocale(),
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    process.env.LANGUAGE,
  );

  for (const entry of candidates) {
    if (!entry) {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    return resolveLocale(trimmed);
  }

  return defaultLocale;
}

let currentLocale: Locale = detectInitialLocale();

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

function getMediaCacheDir(): string {
  if (!cachedMediaCacheDir) {
    cachedMediaCacheDir = join(app.getPath("userData"), "media-cache");
  }
  return cachedMediaCacheDir;
}

async function ensureMediaCacheDir(): Promise<string> {
  const directory = getMediaCacheDir();
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
    void (async () => {
      try {
        const url = new URL(request.url);
        let filePath = decodeURIComponent(url.pathname);
        if (process.platform === "win32" && filePath.startsWith("/")) {
          filePath = filePath.slice(1);
        }

        const ext = extname(filePath).slice(1).toLowerCase();
        const rule = ext ? MEDIA_TRANSCODE_RULES[ext] : undefined;

        let targetPath = filePath;
        let mimeType = MIME_TYPE_BY_EXT[ext] ?? "application/octet-stream";

        if (rule) {
          try {
            const info = await stat(filePath);
            targetPath = await ensureTranscodedMediaAsset(
              filePath,
              info.mtimeMs,
              rule,
            );
            mimeType = rule.mime;
          } catch (error) {
            const errno = error as NodeJS.ErrnoException;
            if (errno?.code === "ENOENT") {
              callback({ statusCode: 404 });
              return;
            }
            console.error(
              "Failed to prepare transcoded media",
              filePath,
              error,
            );
            callback({ statusCode: 500 });
            return;
          }
        }

        const stream = createReadStream(targetPath);
        stream.on("error", (error) => {
          console.error(
            "Failed to stream file for photo protocol",
            error,
            targetPath,
          );
          callback({ statusCode: 404 });
        });

        stream.once("open", () => {
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
    })();
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
  return isCacheEntryFresh(targetPath, sourceModifiedAt);
}

async function isCacheEntryFresh(
  targetPath: string,
  sourceModifiedAt: number,
): Promise<boolean> {
  try {
    const info = await stat(targetPath);
    if (info.size <= 0) {
      return false;
    }
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

  const ext = extname(filePath).slice(1).toLowerCase();
  const transcodeRule = MEDIA_TRANSCODE_RULES[ext ?? ""];

  let pipelineSourcePath = filePath;

  if (transcodeRule && transcodeRule.fallback === "heic-convert") {
    if (heicSharpDecodeAvailable === null) {
      try {
        await sharp(filePath).metadata();
        heicSharpDecodeAvailable = true;
      } catch (error) {
        if (isHeicDecodePluginError(error)) {
          heicSharpDecodeAvailable = false;
        } else {
          throw error;
        }
      }
    }

    if (heicSharpDecodeAvailable === false) {
      pipelineSourcePath = await ensureTranscodedMediaAsset(
        filePath,
        sourceModifiedAt,
        transcodeRule,
      );
    }
  }

  const tasks: Array<Promise<sharp.OutputInfo>> = [];
  let pipeline = sharp(pipelineSourcePath).rotate();

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
    try {
      await Promise.all(tasks);
    } catch (error) {
      if (
        transcodeRule?.fallback === "heic-convert" &&
        heicSharpDecodeAvailable !== false &&
        isHeicDecodePluginError(error)
      ) {
        heicSharpDecodeAvailable = false;
        pipelineSourcePath = await ensureTranscodedMediaAsset(
          filePath,
          sourceModifiedAt,
          transcodeRule,
        );
        pipeline = sharp(pipelineSourcePath).rotate();
        tasks.length = 0;
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
      } else {
        throw error;
      }
    }
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

async function loadPhotoCollectionFromDirectory(
  directory: string,
): Promise<PhotoCollectionPayload> {
  if (!directory) {
    return {
      directory: null,
      photos: [],
      ratings: {},
    };
  }

  try {
    const stats = await stat(directory);
    if (!stats.isDirectory()) {
      return {
        directory: null,
        photos: [],
        ratings: {},
      };
    }
  } catch (error) {
    return {
      directory: null,
      photos: [],
      ratings: {},
    };
  }

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
          photos: [],
          ratings: {},
        };
      }

      return loadPhotoCollectionFromDirectory(result.filePaths[0]);
    },
  );

  ipcMain.handle(
    "photos:load-folder",
    async (_event, directoryPath: unknown): Promise<PhotoCollectionPayload> => {
      if (typeof directoryPath !== "string") {
        return {
          directory: null,
          photos: [],
          ratings: {},
        };
      }

      return loadPhotoCollectionFromDirectory(directoryPath);
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
    "directories:open",
    async (_event, directoryPath: string): Promise<OpenDirectoryResult> => {
      try {
        if (!existsSync(directoryPath)) {
          return {
            success: false,
            message: translate(currentLocale, "app.error.revealNotFound"),
          };
        }

        const info = await stat(directoryPath);
        if (!info.isDirectory()) {
          shell.showItemInFolder(directoryPath);
          return { success: true };
        }

        const result = await shell.openPath(directoryPath);
        if (typeof result === "string" && result.length > 0) {
          return {
            success: false,
            message: result,
          };
        }

        return { success: true };
      } catch (error) {
        console.error("Failed to open directory", directoryPath, error);
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

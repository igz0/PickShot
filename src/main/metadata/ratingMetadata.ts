import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { ExifTool } from "exiftool-vendored";
import type { Tags } from "exiftool-vendored";

let exiftool: ExifTool | null = null;
let metadataEnabled = true;
let hasLoggedDisable = false;

const METADATA_TASK_TIMEOUT_MS = 45_000;
const METADATA_TASK_RETRIES = 2;
const SLOW_VOLUME_STAT_THRESHOLD_MS = 2_000;

const slowVolumeCache = new Map<string, boolean>();

function ensureExifTool(): ExifTool | null {
  if (!metadataEnabled) {
    return null;
  }

  if (!exiftool) {
    try {
      exiftool = new ExifTool({
        taskTimeoutMillis: METADATA_TASK_TIMEOUT_MS,
        taskRetries: METADATA_TASK_RETRIES,
        exiftoolArgs: ["-overwrite_original"],
      });
    } catch (error) {
      disableMetadata("initialize", error);
      return null;
    }
  }

  return exiftool;
}

function disableMetadata(context: string, error: unknown): void {
  if (!metadataEnabled) {
    return;
  }

  metadataEnabled = false;

  if (!hasLoggedDisable) {
    hasLoggedDisable = true;
    console.warn(
      "Disabling metadata integration due to persistent errors",
      context,
      error,
    );
  }

  if (exiftool) {
    void exiftool.end().catch(() => {
      /** ignore */
    });
    exiftool = null;
  }
}

export function isMetadataEnabled(): boolean {
  return metadataEnabled;
}

export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, Math.round(value)));
}

function coerceRating(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 5) {
      return clampRating(raw / 20);
    }
    return clampRating(raw);
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    const numeric = Number.parseFloat(raw);
    if (Number.isFinite(numeric)) {
      if (numeric > 5) {
        return clampRating(numeric / 20);
      }
      return clampRating(numeric);
    }
  }
  return null;
}

function extractRating(tags: Tags): number | null {
  const source = tags as Record<string, unknown>;
  const candidates = [
    source.Rating,
    source.XmpRating,
    source["Xmp:Rating"],
    source.RatingPercent,
  ];
  for (const candidate of candidates) {
    const rating = coerceRating(candidate);
    if (typeof rating === "number") {
      return rating;
    }
  }
  return null;
}

function isMetadataTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("process terminated before task completed") ||
    normalized.includes("task timeout") ||
    normalized.includes("waited ")
  );
}

async function isLikelySlowVolume(filePath: string): Promise<boolean> {
  const directory = dirname(filePath);
  const cached = slowVolumeCache.get(directory);
  if (cached != null) {
    return cached;
  }

  const start = performance.now();
  try {
    await stat(filePath);
  } catch {
    slowVolumeCache.set(directory, false);
    return false;
  }

  const elapsed = performance.now() - start;
  const slow = elapsed >= SLOW_VOLUME_STAT_THRESHOLD_MS;
  slowVolumeCache.set(directory, slow);
  if (slow) {
    console.info(
      "Skipping metadata writes on slow volume",
      directory,
      `${elapsed.toFixed(0)}ms`,
    );
  }
  return slow;
}

export async function readRatingFromMetadata(
  filePath: string,
): Promise<number | null> {
  const worker = ensureExifTool();
  if (!worker) {
    return null;
  }

  try {
    const tags = await worker.read(filePath);
    const rating = extractRating(tags);
    if (typeof rating === "number") {
      return rating;
    }
    return null;
  } catch (error) {
    console.warn("Failed to read rating metadata", filePath, error);
    if (!isMetadataTimeoutError(error)) {
      disableMetadata("read", error);
    }
    return null;
  }
}

export async function writeRatingToMetadata(
  filePath: string,
  rating: number,
): Promise<void> {
  if (await isLikelySlowVolume(filePath)) {
    return;
  }

  const worker = ensureExifTool();
  if (!worker) {
    return;
  }

  const normalized = clampRating(rating);
  try {
    await worker.write(filePath, {
      Rating: normalized,
      RatingPercent: normalized * 20,
    });
  } catch (error) {
    console.error("Failed to write rating metadata", filePath, error);
    if (!isMetadataTimeoutError(error)) {
      disableMetadata("write", error);
    }
    throw error;
  }
}

export async function shutdownMetadataTools(): Promise<void> {
  if (exiftool) {
    await exiftool.end();
    exiftool = null;
  }
}

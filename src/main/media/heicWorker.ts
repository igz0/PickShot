import { parentPort } from "node:worker_threads";
import { readFile, writeFile } from "node:fs/promises";
import heicConvert from "heic-convert";

if (!parentPort) {
  throw new Error("HEIC worker must be run as a worker thread");
}

interface WorkerPayload {
  id: number;
  filePath: string;
  targetPath: string;
  quality: number;
}

interface WorkerResponse {
  id: number;
  status: "ok" | "error";
  error?: {
    message: string;
    code?: string;
  };
}

function serializeError(error: unknown): WorkerResponse["error"] {
  if (error instanceof Error) {
    const err: WorkerResponse["error"] = { message: error.message };
    const errno = error as NodeJS.ErrnoException;
    if (errno.code) {
      err.code = errno.code;
    }
    return err;
  }
  return { message: String(error ?? "Unknown error") };
}

parentPort.on("message", async (payload: WorkerPayload) => {
  const response: WorkerResponse = { id: payload.id, status: "ok" };

  try {
    const input = await readFile(payload.filePath);
    const output = await heicConvert({
      buffer: input,
      format: "JPEG",
      quality: payload.quality,
    });
    await writeFile(payload.targetPath, output);
  } catch (error) {
    response.status = "error";
    response.error = serializeError(error);
  }

  parentPort!.postMessage(response);
});

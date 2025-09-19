import type { Locale, LocaleDescriptor } from "@shared/i18n";
import type {
  DeletePhotoResult,
  PhotoCollectionPayload,
  PhotoMeta,
  RatingUpdatePayload,
  RatingUpdateResult,
  RatingsSyncPayload,
  RenamePhotoPayload,
  RenamePhotoResult,
  RevealPhotoResult,
  ThumbnailReadyPayload,
} from "@shared/types";
import { type IpcRendererEvent, contextBridge, ipcRenderer } from "electron";

const api = {
  selectFolder(): Promise<PhotoCollectionPayload> {
    return ipcRenderer.invoke("photos:select-folder");
  },
  deletePhoto(filePath: string): Promise<DeletePhotoResult> {
    return ipcRenderer.invoke("photos:delete", filePath);
  },
  revealPhoto(filePath: string): Promise<RevealPhotoResult> {
    return ipcRenderer.invoke("photos:reveal", filePath);
  },
  renamePhoto(payload: RenamePhotoPayload): Promise<RenamePhotoResult> {
    return ipcRenderer.invoke("photos:rename", payload);
  },
  updateRating(payload: RatingUpdatePayload): Promise<RatingUpdateResult> {
    return ipcRenderer.invoke("ratings:update", payload);
  },
  onThumbnailsReady(
    callback: (payload: ThumbnailReadyPayload) => void,
  ): () => void {
    const listener = (
      _event: IpcRendererEvent,
      payload: ThumbnailReadyPayload,
    ) => {
      callback(payload);
    };
    ipcRenderer.on("thumbnails:ready", listener);
    return () => {
      ipcRenderer.removeListener("thumbnails:ready", listener);
    };
  },
  onRatingsRefreshed(
    callback: (payload: RatingsSyncPayload) => void,
  ): () => void {
    const listener = (
      _event: IpcRendererEvent,
      payload: RatingsSyncPayload,
    ) => {
      callback(payload);
    };
    ipcRenderer.on("ratings:refreshed", listener);
    return () => {
      ipcRenderer.removeListener("ratings:refreshed", listener);
    };
  },
  getLocale(): Promise<LocaleDescriptor> {
    return ipcRenderer.invoke("app:get-locale");
  },
  setLocale(locale: Locale): Promise<void> {
    return ipcRenderer.invoke("app:set-locale", locale);
  },
};

contextBridge.exposeInMainWorld("api", api);

export type {
  DeletePhotoResult,
  PhotoMeta,
  PhotoCollectionPayload,
  RevealPhotoResult,
  RenamePhotoPayload,
  RenamePhotoResult,
  RatingUpdatePayload,
  RatingUpdateResult,
  RatingsSyncPayload,
  ThumbnailReadyPayload,
} from "@shared/types";

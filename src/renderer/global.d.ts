import type {
  DeletePhotoResult,
  OpenDirectoryResult,
  PhotoCollectionPayload,
  RatingUpdatePayload,
  RatingUpdateResult,
  RatingsSyncPayload,
  RenamePhotoPayload,
  RenamePhotoResult,
  RevealPhotoResult,
  ThumbnailReadyPayload,
} from "@preload/index";
import type { Locale } from "@shared/i18n";

declare global {
  interface Window {
    api: {
      selectFolder(): Promise<PhotoCollectionPayload>;
      loadFolder(directoryPath: string): Promise<PhotoCollectionPayload>;
      deletePhoto(filePath: string): Promise<DeletePhotoResult>;
      revealPhoto(filePath: string): Promise<RevealPhotoResult>;
      openDirectory(directoryPath: string): Promise<OpenDirectoryResult>;
      renamePhoto(payload: RenamePhotoPayload): Promise<RenamePhotoResult>;
      updateRating(payload: RatingUpdatePayload): Promise<RatingUpdateResult>;
      onThumbnailsReady(
        callback: (payload: ThumbnailReadyPayload) => void,
      ): () => void;
      onRatingsRefreshed(
        callback: (payload: RatingsSyncPayload) => void,
      ): () => void;
      getLocale(): Promise<{ locale: Locale }>;
      setLocale(locale: Locale): Promise<void>;
    };
  }
}

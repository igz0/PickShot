export interface PhotoMeta {
  id: string;
  name: string;
  filePath: string;
  fileUrl: string;
  thumbnailUrl: string;
  thumbnailRetinaUrl: string;
  size: number;
  modifiedAt: number;
}

export interface PhotoCollectionPayload {
  directory: string | null;
  photos: PhotoMeta[];
  ratings: Record<string, number>;
}

export interface ThumbnailReadyPayload {
  id: string;
  thumbnailUrl: string;
  thumbnailRetinaUrl: string;
}

export interface RatingsSyncPayload {
  ratings: Record<string, number>;
}

export interface RatingUpdatePayload {
  id: string;
  rating: number;
}

export interface RatingUpdateResult {
  success: boolean;
  message?: string;
}

export interface DeletePhotoResult {
  success: boolean;
  message?: string;
}

export interface RevealPhotoResult {
  success: boolean;
  message?: string;
}

export interface OpenDirectoryResult {
  success: boolean;
  message?: string;
}

export interface RenamePhotoPayload {
  filePath: string;
  newName: string;
}

export interface RenamePhotoResult {
  success: boolean;
  message?: string;
  photo?: PhotoMeta;
}

import type { PhotoMeta } from "@preload/index";

export type RatedPhoto = PhotoMeta & {
  rating: number;
};

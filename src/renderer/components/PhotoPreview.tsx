import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { RatedPhoto } from "../types";
import RatingStars from "./RatingStars";

interface PhotoPreviewProps {
  photos: RatedPhoto[];
  primaryPhoto: RatedPhoto | null;
  onSetRating: (ids: string[], rating: number) => void;
  onDelete: (photos: RatedPhoto[]) => void;
  onExpand: (photo: RatedPhoto) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[exponent]}`;
}

const STACK_TRANSFORMS = [
  "-rotate-[20deg] -translate-x-12 translate-y-8",
  "-rotate-[6deg] -translate-x-5 translate-y-2",
  "rotate-[6deg] translate-x-5 -translate-y-2",
  "rotate-[20deg] translate-x-12 translate-y-6",
] as const;

export default function PhotoPreview({
  photos,
  primaryPhoto,
  onSetRating,
  onDelete,
  onExpand,
}: PhotoPreviewProps) {
  const { t, formatDate, formatNumber } = useI18n();
  const selectionCount = photos.length;

  const selectionIds = useMemo(
    () => photos.map((photo) => photo.id),
    [photos],
  );

  const hasMixedRatings = useMemo(() => {
    if (photos.length <= 1) {
      return false;
    }
    const first = photos[0]?.rating ?? 0;
    return photos.some((photo) => photo.rating !== first);
  }, [photos]);
  const displayRating = hasMixedRatings ? 0 : primaryPhoto?.rating ?? 0;

  return (
    <div className="flex min-h-0 flex-col rounded-3xl w-full bg-[linear-gradient(175deg,_rgba(22,26,38,0.95),_rgba(12,14,24,0.92))] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),_0_20px_44px_rgba(0,0,0,0.32)]">
      <AnimatePresence mode="wait">
        {selectionCount === 0 || !primaryPhoto ? (
          <motion.div
            key="empty"
            className="flex h-full items-center justify-center text-center text-slate-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {t("photoPreview.empty")}
          </motion.div>
        ) : selectionCount === 1 ? (
          <motion.div
            key={primaryPhoto.id}
            className="flex h-full flex-col gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            <button
              type="button"
              className="relative flex w-full flex-none items-center justify-center overflow-hidden rounded-2xl border-none bg-slate-950/70 p-0 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 h-[65vh] max-h-[540px]"
              onClick={() => onExpand(primaryPhoto)}
            >
              <img
                src={primaryPhoto.fileUrl}
                alt={primaryPhoto.name}
                className="h-full w-full object-cover transition-[object-position] duration-300"
              />
            </button>
            <div className="flex flex-col gap-3 px-3 py-5">
              <h2
                className="text-lg font-semibold text-slate-50"
                title={primaryPhoto.name}
              >
                {primaryPhoto.name}
              </h2>
              <div className="flex gap-4 text-sm text-indigo-200">
                <span>{formatBytes(primaryPhoto.size)}</span>
                <span>{formatDate(primaryPhoto.modifiedAt)}</span>
              </div>
              <div>
                <RatingStars
                  rating={primaryPhoto.rating}
                  onChange={(value) => onSetRating([primaryPhoto.id], value)}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-rose-50 shadow-[0_10px_22px_rgba(255,76,136,0.32)] transition hover:shadow-[0_12px_28px_rgba(255,76,136,0.42)]"
                  onClick={() => onDelete([primaryPhoto])}
                >
                  {t("photoPreview.delete")}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="multi"
            className="flex h-full flex-col gap-5"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <button
              type="button"
              className="relative flex h-[320px] flex-none items-center justify-center overflow-hidden rounded-3xl bg-slate-950/70 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
              onClick={() => onExpand(primaryPhoto)}
            >
              <div className="relative flex h-full w-full items-center justify-center">
                {photos
                  .slice(0, STACK_TRANSFORMS.length)
                  .map((photo, index) => (
                    <img
                      key={photo.id}
                      src={photo.fileUrl}
                      alt={photo.name}
                      className={`absolute h-5/6 w-5/6 rounded-3xl object-cover shadow-[0_18px_32px_rgba(0,0,0,0.35)] transition-transform duration-300 ${STACK_TRANSFORMS[index] ?? ""}`}
                      style={{ zIndex: index + 1 }}
                    />
                  ))}
                {selectionCount > STACK_TRANSFORMS.length ? (
                  <div className="absolute bottom-4 right-4 rounded-full bg-slate-950/80 px-4 py-1 text-xs font-semibold text-indigo-100 shadow-lg">
                    +{formatNumber(selectionCount - STACK_TRANSFORMS.length)}
                  </div>
                ) : null}
              </div>
            </button>
            <div className="flex flex-col gap-4 px-4 pb-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-slate-50">
                  {t("photoPreview.multiTitle", {
                    count: formatNumber(selectionCount),
                  })}
                </h2>
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                  {hasMixedRatings
                    ? t("photoPreview.multiMixedRatings")
                    : primaryPhoto.rating === 0
                      ? t("photoPreview.multiUnifiedRatingNone")
                      : t("photoPreview.multiUnifiedRating", {
                        rating: primaryPhoto.rating,
                      })}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                  {t("photoPreview.multiRatingLabel")}
                </span>
                <RatingStars
                  rating={displayRating}
                  onChange={(value) => onSetRating(selectionIds, value)}
                />
              </div>
              <div className="max-h-28 overflow-auto rounded-xl bg-slate-900/60 p-3 text-xs text-indigo-200/80">
                <ul className="space-y-1">
                  {photos.slice(0, 6).map((photo) => (
                    <li key={photo.id} className="truncate">
                      {photo.name}
                    </li>
                  ))}
                  {selectionCount > 6 ? (
                    <li className="truncate text-indigo-300/80">
                      {t("photoPreview.multiMore", {
                        count: formatNumber(selectionCount - 6),
                      })}
                    </li>
                  ) : null}
                </ul>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-rose-50 shadow-[0_10px_22px_rgba(255,76,136,0.32)] transition hover:shadow-[0_12px_28px_rgba(255,76,136,0.42)]"
                  onClick={() => onDelete(photos)}
                >
                  {t("photoPreview.multiDelete", {
                    count: formatNumber(selectionCount),
                  })}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

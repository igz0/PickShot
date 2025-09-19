import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "../i18n/I18nProvider";
import type { RatedPhoto } from "../types";
import RatingStars from "./RatingStars";

interface PhotoPreviewProps {
  photo: RatedPhoto | null;
  onRate: (id: string, rating: number) => void;
  onDelete: (photo: RatedPhoto) => void;
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

export default function PhotoPreview({
  photo,
  onRate,
  onDelete,
  onExpand,
}: PhotoPreviewProps) {
  const { t, formatDate } = useI18n();
  return (
    <div className="flex min-h-0 flex-col rounded-3xl bg-[linear-gradient(175deg,_rgba(22,26,38,0.95),_rgba(12,14,24,0.92))] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),_0_20px_44px_rgba(0,0,0,0.32)]">
      <AnimatePresence mode="wait">
        {photo ? (
          <motion.div
            key={photo.id}
            className="flex h-full flex-col gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            <button
              type="button"
              className="flex flex-1 items-center justify-center overflow-hidden rounded-2xl border-none bg-slate-950/70 p-0 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
              onClick={() => onExpand(photo)}
            >
              <img
                src={photo.fileUrl}
                alt={photo.name}
                className="h-full w-full max-h-full object-contain"
              />
            </button>
            <div className="flex flex-col gap-3 px-3 py-5">
              <h2
                className="text-lg font-semibold text-slate-50"
                title={photo.name}
              >
                {photo.name}
              </h2>
              <div className="flex gap-4 text-sm text-indigo-200">
                <span>{formatBytes(photo.size)}</span>
                <span>{formatDate(photo.modifiedAt)}</span>
              </div>
              <div>
                <RatingStars
                  rating={photo.rating}
                  onChange={(value) => onRate(photo.id, value)}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-rose-50 shadow-[0_10px_22px_rgba(255,76,136,0.32)] transition hover:shadow-[0_12px_28px_rgba(255,76,136,0.42)]"
                  onClick={() => onDelete(photo)}
                >
                  {t("photoPreview.delete")}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="flex h-full items-center justify-center text-center text-slate-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {t("photoPreview.empty")}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

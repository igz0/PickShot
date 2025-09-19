import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { RatedPhoto } from "../types";
import RatingStars from "./RatingStars";

interface PhotoCardProps {
  photo: RatedPhoto;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRate: (id: string, rating: number) => void;
  onContextMenu: (
    photo: RatedPhoto,
    position: { x: number; y: number },
  ) => void;
  onExpand: (photo: RatedPhoto) => void;
}

const loadedThumbnails = new Set<string>();

export default function PhotoCard({
  photo,
  isSelected,
  onSelect,
  onRate,
  onContextMenu,
  onExpand,
}: PhotoCardProps) {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (loadedThumbnails.has(photo.thumbnailUrl)) {
      setIsImageLoaded(true);
    } else {
      setIsImageLoaded(false);
    }
    setHasImageError(false);
  }, [photo.thumbnailUrl]);

  const cardClass = `flex h-full flex-col gap-2.5 rounded-2xl border border-indigo-400/10 bg-slate-900/90 p-3 shadow-[0_16px_34px_rgba(0,0,0,0.25)] transition-colors ${
    isSelected
      ? "border-sky-300/70 shadow-[0_18px_36px_rgba(86,132,255,0.35)]"
      : ""
  }`;

  return (
    <motion.div
      layout
      className={cardClass}
      onClick={() => onSelect(photo.id)}
      onDoubleClick={() => {
        onSelect(photo.id);
        onExpand(photo);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(photo, { x: event.clientX, y: event.clientY });
      }}
      whileHover={{ translateY: -6 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      <div className="relative flex-1 overflow-hidden rounded-xl bg-slate-900/70">
        <img
          src={photo.thumbnailUrl}
          alt={photo.name}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className={`h-full w-full object-cover transition-opacity duration-300 ${isImageLoaded ? "opacity-100" : "opacity-0"}`}
          srcSet={`${photo.thumbnailUrl} 320w, ${photo.thumbnailRetinaUrl} 480w`}
          sizes="(min-width: 1280px) 240px, (min-width: 768px) 33vw, 90vw"
          onLoad={() => {
            loadedThumbnails.add(photo.thumbnailUrl);
            setIsImageLoaded(true);
          }}
          onError={() => {
            setHasImageError(true);
            setIsImageLoaded(true);
            loadedThumbnails.delete(photo.thumbnailUrl);
          }}
        />
        {!isImageLoaded && !hasImageError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-slate-200" />
            <span className="sr-only">{t("photoCard.loading")}</span>
          </div>
        ) : null}
        {hasImageError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 text-center text-xs text-slate-300">
            <span>{t("photoCard.error")}</span>
          </div>
        ) : null}
        <div className="absolute bottom-2 left-2 rounded-full bg-slate-950/80 px-3 py-1 backdrop-blur">
          <RatingStars
            rating={photo.rating}
            onChange={(value) => onRate(photo.id, value)}
            size="compact"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span
          className="w-full truncate text-xs font-semibold text-slate-50"
          title={photo.name}
        >
          {photo.name}
        </span>
      </div>
    </motion.div>
  );
}

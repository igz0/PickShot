import { AnimatePresence, motion } from "framer-motion";
import { memo, useMemo } from "react";
import type { MouseEvent, DragEvent as ReactDragEvent, ReactNode } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid, type GridChildComponentProps } from "react-window";
import { useI18n } from "../i18n/I18nProvider";
import type { RatedPhoto } from "../types";
import PhotoCard from "./PhotoCard";

interface PhotoGridProps {
  photos: RatedPhoto[];
  selectedIds: string[];
  onSelect: (photo: RatedPhoto, event?: MouseEvent<HTMLDivElement>) => void;
  onRate: (id: string, rating: number) => void;
  onContextMenu: (
    photo: RatedPhoto,
    position: { x: number; y: number },
  ) => void;
  onExpand: (photo: RatedPhoto) => void;
  emptyContent?: ReactNode;
  isDragOver?: boolean;
  onDragEnter?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void;
}

const CELL_HEIGHT = 240;
const MIN_CELL_WIDTH = 220;

interface GridData {
  photos: RatedPhoto[];
  columnCount: number;
  onSelect: (photo: RatedPhoto, event?: MouseEvent<HTMLDivElement>) => void;
  onRate: (id: string, rating: number) => void;
  onContextMenu: (
    photo: RatedPhoto,
    position: { x: number; y: number },
  ) => void;
  onExpand: (photo: RatedPhoto) => void;
  selectedIdSet: Set<string>;
}

const GridCell = memo(
  ({
    columnIndex,
    data,
    rowIndex,
    style,
  }: GridChildComponentProps<GridData>) => {
    const {
      photos,
      columnCount,
      onSelect,
      onRate,
      onContextMenu,
      onExpand,
      selectedIdSet,
    } = data;
    const index = rowIndex * columnCount + columnIndex;
    const photo = photos[index];

    if (!photo) {
      return null;
    }

    const isSelected = selectedIdSet.has(photo.id);

    const cardClass = `flex h-full flex-col gap-2.5 rounded-2xl border border-indigo-400/10 bg-slate-900/90 p-3 shadow-[0_16px_34px_rgba(0,0,0,0.25)] transition-colors ${
      isSelected
        ? "border-sky-300/70 shadow-[0_18px_36px_rgba(86,132,255,0.35)]"
        : ""
    }`;

    return (
      <div style={{ ...style, padding: 10 }}>
        <PhotoCard
          photo={photo}
          isSelected={isSelected}
          onSelect={onSelect}
          onRate={onRate}
          onContextMenu={onContextMenu}
          onExpand={onExpand}
        />
      </div>
    );
  },
);

GridCell.displayName = "GridCell";

export default function PhotoGrid({
  photos,
  selectedIds,
  onSelect,
  onRate,
  onContextMenu,
  onExpand,
  emptyContent,
  isDragOver,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: PhotoGridProps) {
  const { t } = useI18n();
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const content = useMemo(() => {
    if (!photos.length) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          {emptyContent ?? t("photoGrid.empty")}
        </div>
      );
    }

    return (
      <AutoSizer>
        {({ width, height }) => {
          const columnCount = Math.max(1, Math.floor(width / MIN_CELL_WIDTH));
          const columnWidth = Math.floor(width / columnCount);
          const rowCount = Math.ceil(photos.length / columnCount);

          return (
            <FixedSizeGrid
              columnCount={columnCount}
              columnWidth={columnWidth}
              height={height}
              rowCount={rowCount}
              rowHeight={CELL_HEIGHT}
              width={width}
              itemData={{
                photos,
                columnCount,
                onSelect,
                onRate,
                onContextMenu,
                onExpand,
                selectedIdSet,
              }}
            >
              {GridCell}
            </FixedSizeGrid>
          );
        }}
      </AutoSizer>
    );
  }, [
    emptyContent,
    onContextMenu,
    onExpand,
    onRate,
    onSelect,
    photos,
    selectedIdSet,
    t,
  ]);

  return (
    <div
      className="relative h-full w-full"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <AnimatePresence>
        {isDragOver ? (
          <motion.div
            key="grid-drop-overlay"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-sky-400/70 bg-[rgba(9,17,30,0.78)] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center gap-3 text-center text-sm font-semibold text-sky-100">
              <svg
                aria-hidden="true"
                className="h-12 w-12 text-sky-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 7.5V6a1.5 1.5 0 0 1 1.5-1.5H9l2 2h8.5A1.5 1.5 0 0 1 21 8v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
                <path d="M12 16.5V11" />
                <path d="M9.75 12.75 12 10.5 14.25 12.75" />
              </svg>
              <span>{t("app.dnd.prompt")}</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="h-full w-full">{content}</div>
    </div>
  );
}

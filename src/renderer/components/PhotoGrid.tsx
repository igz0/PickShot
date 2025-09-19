import { memo, useMemo } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid, type GridChildComponentProps } from "react-window";
import { useI18n } from "../i18n/I18nProvider";
import type { RatedPhoto } from "../types";
import PhotoCard from "./PhotoCard";

interface PhotoGridProps {
  photos: RatedPhoto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRate: (id: string, rating: number) => void;
  onContextMenu: (
    photo: RatedPhoto,
    position: { x: number; y: number },
  ) => void;
  onExpand: (photo: RatedPhoto) => void;
  emptyMessage?: string;
}

const CELL_HEIGHT = 240;
const MIN_CELL_WIDTH = 220;

interface GridData {
  photos: RatedPhoto[];
  columnCount: number;
  onSelect: (id: string) => void;
  onRate: (id: string, rating: number) => void;
  onContextMenu: (
    photo: RatedPhoto,
    position: { x: number; y: number },
  ) => void;
  onExpand: (photo: RatedPhoto) => void;
  selectedId: string | null;
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
      selectedId,
    } = data;
    const index = rowIndex * columnCount + columnIndex;
    const photo = photos[index];

    if (!photo) {
      return null;
    }

    const isSelected = selectedId === photo.id;

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
  selectedId,
  onSelect,
  onRate,
  onContextMenu,
  onExpand,
  emptyMessage,
}: PhotoGridProps) {
  const { t } = useI18n();
  const content = useMemo(() => {
    if (!photos.length) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          {emptyMessage ?? t("photoGrid.empty")}
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
                selectedId,
              }}
            >
              {GridCell}
            </FixedSizeGrid>
          );
        }}
      </AutoSizer>
    );
  }, [
    emptyMessage,
    onContextMenu,
    onExpand,
    onRate,
    onSelect,
    photos,
    selectedId,
    t,
  ]);

  return <div className="h-full w-full">{content}</div>;
}

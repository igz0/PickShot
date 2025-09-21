import type {
  DeletePhotoResult,
  PhotoCollectionPayload,
  PhotoMeta,
} from "@preload/index";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import PhotoContextMenu from "./components/PhotoContextMenu";
import PhotoGrid from "./components/PhotoGrid";
import PhotoPreview from "./components/PhotoPreview";
import RenamePhotoDialog from "./components/RenamePhotoDialog";
import SortMenu from "./components/SortMenu";
import StarFilterMenu from "./components/StarFilterMenu";
import { useI18n } from "./i18n/I18nProvider";
import type { RatedPhoto } from "./types";

interface DirectoryEntry {
  path: string;
  label: string;
  count: number;
}

type FilterMode = "all" | "rated" | "unrated";
type SortKey =
  | "modifiedDesc"
  | "modifiedAsc"
  | "nameAsc"
  | "nameDesc"
  | "ratingDesc"
  | "ratingAsc";

function shouldIncludePhoto(
  photo: RatedPhoto,
  mode: FilterMode,
  ratingFilter: Set<number> | null,
): boolean {
  const matchesMode =
    mode === "unrated"
      ? photo.rating === 0
      : mode === "rated"
        ? photo.rating > 0
        : true;

  if (!matchesMode) {
    return false;
  }

  if (ratingFilter && ratingFilter.size > 0) {
    if (photo.rating === 0) {
      return ratingFilter.has(0);
    }
    return ratingFilter.has(photo.rating);
  }

  return true;
}

interface PhotoContextMenuState {
  photo: RatedPhoto;
  position: { x: number; y: number };
}

function toRatedPhoto(
  photo: PhotoMeta,
  ratingMap: Record<string, number>,
): RatedPhoto {
  return {
    ...photo,
    rating: ratingMap[photo.id] ?? 0,
  };
}

function extractLabel(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  if (segments.length === 0) return filePath;
  return segments[segments.length - 1];
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

const DEFAULT_PREVIEW_WIDTH = 380;
const MIN_PREVIEW_WIDTH = 260;
const MAX_PREVIEW_WIDTH = 720;
const MIN_GRID_WIDTH = 360;

interface WebkitFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
}

interface DataTransferItemWithEntry extends DataTransferItem {
  webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
}

type FileWithPath = File & { path?: string };

function hasFileItems(items: DataTransferItemList | null): boolean {
  if (!items) {
    return false;
  }
  for (let index = 0; index < items.length; index += 1) {
    if (items[index]?.kind === "file") {
      return true;
    }
  }
  return false;
}

function clampPreviewWidth(width: number, containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return Math.min(Math.max(width, MIN_PREVIEW_WIDTH), MAX_PREVIEW_WIDTH);
  }
  const max = Math.max(
    MIN_PREVIEW_WIDTH,
    Math.min(MAX_PREVIEW_WIDTH, containerWidth - MIN_GRID_WIDTH),
  );
  return Math.min(Math.max(width, MIN_PREVIEW_WIDTH), max);
}

export default function App() {
  const { t, locale, formatNumber, formatPhotoCount } = useI18n();
  const [photos, setPhotos] = useState<RatedPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [directory, setDirectory] = useState<DirectoryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortKey, setSortKey] = useState<SortKey>("modifiedDesc");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<PhotoContextMenuState | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<RatedPhoto | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [previewPanelWidth, setPreviewPanelWidth] = useState(
    DEFAULT_PREVIEW_WIDTH,
  );
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const [isDragOverDropZone, setIsDragOverDropZone] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [ratingFilter, setRatingFilter] = useState<number[]>([]);
  const sortOptions = useMemo<Array<{ value: SortKey; label: string }>>(
    () => [
      {
        value: "modifiedDesc",
        label: t("app.sort.modifiedDesc"),
      },
      {
        value: "modifiedAsc",
        label: t("app.sort.modifiedAsc"),
      },
      {
        value: "nameAsc",
        label: t("app.sort.nameAsc"),
      },
      {
        value: "nameDesc",
        label: t("app.sort.nameDesc"),
      },
      {
        value: "ratingDesc",
        label: t("app.sort.ratingDesc"),
      },
      {
        value: "ratingAsc",
        label: t("app.sort.ratingAsc"),
      },
    ],
    [t],
  );
  const layoutContainerRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef({
    startX: 0,
    startWidth: DEFAULT_PREVIEW_WIDTH,
  });
  const dragDepthRef = useRef(0);

  const totalCount = photos.length;
  const ratedCount = useMemo(
    () => photos.filter((photo) => photo.rating > 0).length,
    [photos],
  );
  const unratedCount = useMemo(
    () => photos.filter((photo) => photo.rating === 0).length,
    [photos],
  );
  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const photo of photos) {
      if (photo.rating === 0) {
        counts[0] += 1;
      } else if (photo.rating > 0 && photo.rating <= 5) {
        counts[photo.rating] += 1;
      }
    }
    return counts;
  }, [photos]);
  const isStarFilterDisabled = totalCount === 0;
  const displayedPhotos = useMemo(() => {
    const ratingFilterSet =
      ratingFilter.length > 0 ? new Set(ratingFilter) : null;
    const filtered = photos.filter((photo) =>
      shouldIncludePhoto(photo, filterMode, ratingFilterSet),
    );

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "modifiedAsc":
          return a.modifiedAt - b.modifiedAt;
        case "modifiedDesc":
          return b.modifiedAt - a.modifiedAt;
        case "nameAsc":
          return a.name.localeCompare(b.name, locale);
        case "nameDesc":
          return b.name.localeCompare(a.name, locale);
        case "ratingAsc":
          if (a.rating === b.rating) {
            return b.modifiedAt - a.modifiedAt;
          }
          return a.rating - b.rating;
        case "ratingDesc":
          if (a.rating === b.rating) {
            return b.modifiedAt - a.modifiedAt;
          }
          return b.rating - a.rating;
        default:
          return 0;
      }
    });

    return sorted;
  }, [filterMode, locale, photos, ratingFilter, sortKey]);
  const displayedCount = displayedPhotos.length;

  const selectedIdSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );
  const photoIdSet = useMemo(
    () => new Set(photos.map((photo) => photo.id)),
    [photos],
  );

  const primarySelectedId = useMemo(() => {
    if (focusId && selectedIdSet.has(focusId)) {
      return focusId;
    }
    return selectedIds[selectedIds.length - 1] ?? null;
  }, [focusId, selectedIdSet, selectedIds]);

  const selectedPhotos = useMemo(
    () => displayedPhotos.filter((photo) => selectedIdSet.has(photo.id)),
    [displayedPhotos, selectedIdSet],
  );

  const selectionCount = selectedPhotos.length;

  const primarySelectedPhoto = useMemo(
    () =>
      primarySelectedId
        ? displayedPhotos.find((photo) => photo.id === primarySelectedId) ?? null
        : null,
    [displayedPhotos, primarySelectedId],
  );

  const mergePhotos = useCallback(
    (
      incoming: PhotoMeta[],
      incomingRatings?: Record<string, number>,
    ): RatedPhoto[] => {
      const ratingMap = incomingRatings ?? {};
      const next = incoming
        .map((photo) => toRatedPhoto(photo, ratingMap))
        .sort((a, b) => b.modifiedAt - a.modifiedAt);

      setPhotos(next);
      return next;
    },
    [],
  );

  useEffect(() => {
    const unsubscribe = window.api.onThumbnailsReady(
      ({ id, thumbnailUrl, thumbnailRetinaUrl }) => {
        setPhotos((prev) =>
          prev.map((photo) =>
            photo.id === id
              ? {
                ...photo,
                thumbnailUrl,
                thumbnailRetinaUrl,
              }
              : photo,
          ),
        );
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onRatingsRefreshed(({ ratings }) => {
      if (!ratings) {
        return;
      }
      setPhotos((prev) => {
        let needsUpdate = false;
        const next = prev.map((photo) => {
          const nextRating = ratings[photo.id];
          if (nextRating === undefined || photo.rating === nextRating) {
            return photo;
          }
          needsUpdate = true;
          return { ...photo, rating: nextRating };
        });
        return needsUpdate ? next : prev;
      });
    });
    return unsubscribe;
  }, []);

  const updateDirectory = useCallback(
    (directoryPath: string, count: number) => {
      setDirectory({
        path: directoryPath,
        label: extractLabel(directoryPath),
        count,
      });
    },
    [],
  );

  const applyCollection = useCallback(
    (payload: PhotoCollectionPayload) => {
      if (!payload.directory) {
        return;
      }

      if (payload.photos.length === 0) {
        return;
      }

      const nextPhotos = mergePhotos(payload.photos, payload.ratings);
      updateDirectory(payload.directory, payload.photos.length);
      const initialId = nextPhotos[0]?.id ?? null;
      if (initialId) {
        setSelectedIds([initialId]);
        setFocusId(initialId);
      } else {
        setSelectedIds([]);
        setFocusId(null);
      }
    },
    [mergePhotos, updateDirectory],
  );

  const handleLoad = useCallback(async () => {
    try {
      setIsLoading(true);
      const payload = await window.api.selectFolder();
      applyCollection(payload);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [applyCollection]);

  const handleClearDirectory = useCallback(() => {
    setPhotos([]);
    setSelectedIds([]);
    setFocusId(null);
    setDirectory(null);
    setExpandedPhotoId(null);
    setContextMenu(null);
    setRenameTarget(null);
    setRenameValue("");
    setIsRenaming(false);
    setIsDragOverDropZone(false);
    dragDepthRef.current = 0;
  }, []);

  const handleOpenDirectory = useCallback(() => {
    if (!directory) {
      return;
    }
    void window.api
      .openDirectory(directory.path)
      .catch((error) => {
        console.error("Failed to open directory", error);
      });
  }, [directory]);

  const computeSelectionAfterRating = useCallback(
    (ids: string[], rating: number) => {
      if (!ids.some((id) => selectedIds.includes(id))) {
        return null;
      }

      const ratingFilterSet =
        ratingFilter.length > 0 ? new Set(ratingFilter) : null;
      const displayedIdSet = new Set(displayedPhotos.map((photo) => photo.id));
      const hiddenIds = ids.filter((id) => {
        const photo = photos.find((item) => item.id === id);
        if (!photo) {
          return false;
        }
        const updated = { ...photo, rating };
        return !shouldIncludePhoto(updated, filterMode, ratingFilterSet);
      });

      if (hiddenIds.length === 0) {
        return null;
      }

      const hiddenSet = new Set(hiddenIds);
      const remainingSelected = selectedIds.filter(
        (id) => !hiddenSet.has(id) && displayedIdSet.has(id),
      );

      const candidateIds = ids.filter((id) => selectedIds.includes(id));
      const primaryAnchor =
        (focusId && selectedIds.includes(focusId) ? focusId : null) ??
        candidateIds[candidateIds.length - 1] ??
        selectedIds[selectedIds.length - 1] ??
        null;

      let nextCandidate: RatedPhoto | null = null;
      if (primaryAnchor) {
        const anchorIndex = displayedPhotos.findIndex(
          (photo) => photo.id === primaryAnchor,
        );
        if (anchorIndex !== -1) {
          for (let index = anchorIndex + 1; index < displayedPhotos.length; index += 1) {
            const candidate = displayedPhotos[index];
            if (!hiddenSet.has(candidate.id)) {
              nextCandidate = candidate;
              break;
            }
          }
          if (!nextCandidate) {
            for (let index = anchorIndex - 1; index >= 0; index -= 1) {
              const candidate = displayedPhotos[index];
              if (!hiddenSet.has(candidate.id)) {
                nextCandidate = candidate;
                break;
              }
            }
          }
        }
      }

      let nextSelection = remainingSelected;
      if (nextCandidate && !nextSelection.includes(nextCandidate.id)) {
        nextSelection = [...nextSelection, nextCandidate.id];
      }

      if (!nextSelection.length && nextCandidate) {
        nextSelection = [nextCandidate.id];
      }

      const nextFocus = nextSelection.length
        ? nextCandidate && nextSelection.includes(nextCandidate.id)
          ? nextCandidate.id
          : nextSelection[nextSelection.length - 1]
        : null;

      return {
        ids: nextSelection,
        focus: nextFocus,
      };
    },
    [
      displayedPhotos,
      filterMode,
      focusId,
      photos,
      ratingFilter,
      selectedIds,
    ],
  );

  const applyUniformRating = useCallback((ids: string[], rating: number) => {
    if (!ids.length) {
      return;
    }

    const nextSelection = computeSelectionAfterRating(ids, rating);

    const targetIds = new Set(ids);
    setPhotos((prev) =>
      prev.map((photo) =>
        targetIds.has(photo.id) ? { ...photo, rating } : photo,
      ),
    );

    void Promise.all(
      ids.map((id) =>
        window.api.updateRating({ id, rating }).then((result) => {
          if (!result.success && result.message) {
            console.error("Failed to persist rating", result.message);
          }
          return result;
        }),
      ),
    ).catch((error) => {
      console.error("Failed to persist ratings", error);
    });

    if (nextSelection) {
      setSelectedIds(nextSelection.ids);
      setFocusId(nextSelection.focus);
    }
  }, [computeSelectionAfterRating]);

  const applyRelativeRating = useCallback(
    (targets: RatedPhoto[], delta: number) => {
      if (!targets.length || delta === 0) {
        return;
      }

      const updates = targets
        .map((photo) => {
          const nextRating = Math.max(0, Math.min(5, photo.rating + delta));
          if (nextRating === photo.rating) {
            return null;
          }
          return { id: photo.id, rating: nextRating };
        })
        .filter((entry): entry is { id: string; rating: number } => Boolean(entry));

      if (!updates.length) {
        return;
      }

      const updateMap = new Map(updates.map((entry) => [entry.id, entry.rating]));
      setPhotos((prev) =>
        prev.map((photo) =>
          updateMap.has(photo.id)
            ? { ...photo, rating: updateMap.get(photo.id)! }
            : photo,
        ),
      );

      void Promise.all(
        updates.map((entry) =>
          window.api.updateRating(entry).then((result) => {
            if (!result.success && result.message) {
              console.error("Failed to persist rating", result.message);
            }
            return result;
          }),
        ),
      ).catch((error) => {
        console.error("Failed to persist ratings", error);
      });
    },
    [],
  );

  const handleRate = useCallback(
    (id: string, rating: number) => {
      applyUniformRating([id], rating);
    },
    [applyUniformRating],
  );

  const handleRatingFilterChange = useCallback((next: number[]) => {
    setRatingFilter(next);
  }, []);

  const handleSelect = useCallback(
    (photo: RatedPhoto, event?: ReactMouseEvent<HTMLDivElement>) => {
      const isToggle = Boolean(event?.metaKey || event?.ctrlKey);
      const isRange = Boolean(event?.shiftKey && focusId);
      const anchorId = focusId;

      setSelectedIds((current) => {
        let next: string[];

        if (isRange && anchorId) {
          const anchorIndex = displayedPhotos.findIndex(
            (item) => item.id === anchorId,
          );
          const targetIndex = displayedPhotos.findIndex(
            (item) => item.id === photo.id,
          );
          if (anchorIndex === -1 || targetIndex === -1) {
            next = [photo.id];
          } else {
            const start = Math.min(anchorIndex, targetIndex);
            const end = Math.max(anchorIndex, targetIndex);
            next = displayedPhotos
              .slice(start, end + 1)
              .map((item) => item.id);
          }
        } else if (isToggle) {
          if (current.includes(photo.id)) {
            next = current.filter((id) => id !== photo.id);
          } else {
            next = [...current, photo.id];
          }
        } else {
          next = [photo.id];
        }

        let nextFocus = focusId;
        if (isRange) {
          nextFocus = photo.id;
        } else if (isToggle) {
          if (current.includes(photo.id)) {
            if (focusId === photo.id) {
              nextFocus = next[next.length - 1] ?? null;
            }
          } else {
            nextFocus = photo.id;
          }
        } else {
          nextFocus = photo.id;
        }

        setFocusId(nextFocus ?? null);
        return next;
      });
    },
    [displayedPhotos, focusId],
  );

  const handleExpand = useCallback((photo: RatedPhoto) => {
    setSelectedIds((current) => {
      if (current.length === 1 && current[0] === photo.id) {
        return current;
      }
      return [photo.id];
    });
    setFocusId(photo.id);
    setExpandedPhotoId(photo.id);
  }, []);

  const handleContextMenuRequest = useCallback(
    (photo: RatedPhoto, position: { x: number; y: number }) => {
      setSelectedIds((current) => {
        if (current.includes(photo.id)) {
          setFocusId(photo.id);
          return current;
        }
        setFocusId(photo.id);
        return [photo.id];
      });
      setContextMenu({ photo, position });
    },
    [],
  );

  useEffect(() => {
    if (renameTarget) {
      setRenameValue(renameTarget.name);
    } else {
      setRenameValue("");
    }
  }, [renameTarget]);

  const moveSelection = useCallback(
    (offset: number) => {
      if (!displayedPhotos.length) return;
      const currentIndex = focusId
        ? displayedPhotos.findIndex((photo) => photo.id === focusId)
        : -1;
      const baseIndex =
        currentIndex === -1
          ? offset > 0
            ? 0
            : displayedPhotos.length - 1
          : currentIndex;
      if (baseIndex < 0) {
        return;
      }
      const nextIndex = baseIndex + offset;
      const effectiveIndex =
        nextIndex < 0 || nextIndex >= displayedPhotos.length
          ? baseIndex
          : nextIndex;
      const nextPhoto = displayedPhotos[effectiveIndex];
      if (!nextPhoto) {
        return;
      }
      setFocusId(nextPhoto.id);
      setSelectedIds((current) => {
        if (current.length === 1 && current[0] === nextPhoto.id) {
          return current;
        }
        return [nextPhoto.id];
      });
    },
    [displayedPhotos, focusId],
  );

  const selectEdge = useCallback(
    (direction: "start" | "end") => {
      if (!displayedPhotos.length) return;
      const nextPhoto =
        direction === "start"
          ? displayedPhotos[0]
          : displayedPhotos[displayedPhotos.length - 1];
      if (!nextPhoto) {
        return;
      }
      setFocusId(nextPhoto.id);
      setSelectedIds((current) => {
        if (current.length === 1 && current[0] === nextPhoto.id) {
          return current;
        }
        return [nextPhoto.id];
      });
    },
    [displayedPhotos],
  );

  const emptyGridContent = useMemo(() => {
    if (filterMode === "rated") {
      return (
        <p className="max-w-xs text-center text-sm text-indigo-200/80">
          {t("app.empty.rated")}
        </p>
      );
    }
    if (filterMode === "unrated") {
      return (
        <p className="max-w-xs text-center text-sm text-indigo-200/80">
          {t("app.empty.unrated")}
        </p>
      );
    }
    return (
      <div className="flex flex-col items-center gap-4 text-center text-indigo-100">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/10 text-sky-300">
          <svg
            aria-hidden="true"
            className="h-9 w-9"
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
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-indigo-50">
            {t("app.dnd.emptyTitle")}
          </p>
          <p className="max-w-xs text-sm text-indigo-200/80">
            {t("app.dnd.emptyDescription")}
          </p>
        </div>
      </div>
    );
  }, [filterMode, t]);

  const toggleFilter = useCallback(() => {
    setFilterMode((prev) => {
      const order: FilterMode[] = ["all", "rated", "unrated"];
      const counts: Record<FilterMode, number> = {
        all: totalCount,
        rated: ratedCount,
        unrated: unratedCount,
      };
      const currentIndex = order.indexOf(prev);
      for (let offset = 1; offset <= order.length; offset += 1) {
        const candidate = order[(currentIndex + offset) % order.length];
        if (candidate === "all" || counts[candidate] > 0) {
          return candidate;
        }
      }
      return "all";
    });
  }, [ratedCount, totalCount, unratedCount]);

  const cycleSort = useCallback(() => {
    setSortKey((prev) => {
      const order: SortKey[] = [
        "modifiedDesc",
        "modifiedAsc",
        "nameAsc",
        "nameDesc",
        "ratingDesc",
        "ratingAsc",
      ];
      const currentIndex = order.indexOf(prev);
      const nextIndex = (currentIndex + 1) % order.length;
      return order[nextIndex];
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const deletePhotos = useCallback(
    async (targets: RatedPhoto[]) => {
      if (!targets.length) {
        return;
      }

      const confirmationMessage =
        targets.length === 1
          ? t("app.confirm.delete", { name: targets[0].name })
          : t("app.confirm.deleteMany", {
            count: formatNumber(targets.length),
          });

      const confirmed = window.confirm(confirmationMessage);
      if (!confirmed) {
        return;
      }

      const successfulIds: string[] = [];
      const failed: Array<{ photo: RatedPhoto; result: DeletePhotoResult | null }> = [];

      for (const target of targets) {
        try {
          const result = await window.api.deletePhoto(target.filePath);
          if (result.success) {
            successfulIds.push(target.id);
          } else {
            failed.push({ photo: target, result });
          }
        } catch (error) {
          console.error(error);
          failed.push({ photo: target, result: null });
        }
      }

      if (failed.length === targets.length) {
        const firstFailure = failed[0];
        const fallbackMessage = firstFailure?.result?.message
          ? t("app.error.deleteWithReason", {
            reason: firstFailure.result.message,
          })
          : t("app.error.deleteUnexpected");
        window.alert(fallbackMessage);
        return;
      }

      if (failed.length > 0) {
        const firstFailure = failed[0];
        const message = firstFailure?.result?.message
          ? t("app.error.deleteWithReason", { reason: firstFailure.result.message })
          : t("app.error.deleteUnexpected");
        window.alert(message);
      }

      if (successfulIds.length === 0) {
        return;
      }

      const successIdSet = new Set(successfulIds);

      setPhotos((prev) => prev.filter((photo) => !successIdSet.has(photo.id)));

      setDirectory((prev) => {
        if (!prev) {
          return prev;
        }
        const removedCount = targets.filter(
          (photo) =>
            successIdSet.has(photo.id) &&
            photo.filePath.startsWith(prev.path),
        ).length;
        if (removedCount === 0) {
          return prev;
        }
        return {
          ...prev,
          count: Math.max(0, prev.count - removedCount),
        };
      });

      setSelectedIds((current) => current.filter((id) => !successIdSet.has(id)));
      setFocusId((current) =>
        current && successIdSet.has(current) ? null : current,
      );
      setExpandedPhotoId((current) =>
        current && successIdSet.has(current) ? null : current,
      );
    },
    [formatNumber, t],
  );

  const handleDelete = useCallback(
    (photo: RatedPhoto) => {
      void deletePhotos([photo]);
    },
    [deletePhotos],
  );

  const handleDeleteSelection = useCallback(() => {
    if (selectedPhotos.length === 0) {
      return;
    }
    void deletePhotos([...selectedPhotos]);
  }, [deletePhotos, selectedPhotos]);

  const handleReveal = useCallback(
    async (photo: RatedPhoto) => {
      try {
        const result = await window.api.revealPhoto(photo.filePath);
        if (!result.success) {
          window.alert(
            result.message
              ? t("app.error.revealWithReason", { reason: result.message })
              : t("app.error.reveal"),
          );
        }
      } catch (error) {
        console.error(error);
        window.alert(t("app.error.reveal"));
      }
    },
    [t],
  );

  const handleContextMenuDelete = useCallback(() => {
    if (!contextMenu) {
      return;
    }
    closeContextMenu();
    if (selectionCount > 1) {
      handleDeleteSelection();
      return;
    }
    const target = contextMenu.photo;
    void handleDelete(target);
  }, [
    closeContextMenu,
    contextMenu,
    handleDelete,
    handleDeleteSelection,
    selectionCount,
  ]);

  const handleContextMenuReveal = useCallback(() => {
    if (!contextMenu) {
      return;
    }
    const target = contextMenu.photo;
    closeContextMenu();
    void handleReveal(target);
  }, [closeContextMenu, contextMenu, handleReveal]);

  const handleContextMenuRename = useCallback(() => {
    if (!contextMenu) {
      return;
    }
    const target = contextMenu.photo;
    closeContextMenu();
    if (selectionCount !== 1) {
      return;
    }
    setRenameTarget(target);
  }, [closeContextMenu, contextMenu, selectionCount]);

  const closeRenameDialog = useCallback(() => {
    setRenameTarget(null);
    setRenameValue("");
    setIsRenaming(false);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTarget) {
      return;
    }
    const trimmed = renameValue.trim();
    if (!trimmed) {
      window.alert(t("app.error.renameEmpty"));
      return;
    }
    if (trimmed === renameTarget.name) {
      closeRenameDialog();
      return;
    }

    setIsRenaming(true);
    try {
      const result = await window.api.renamePhoto({
        filePath: renameTarget.filePath,
        newName: trimmed,
      });
      if (!result.success || !result.photo) {
        window.alert(
          result.message
            ? t("app.error.renameWithReason", { reason: result.message })
            : t("app.error.rename"),
        );
        setIsRenaming(false);
        return;
      }

      setPhotos((prev) =>
        prev.map((item) =>
          item.id === renameTarget.id
            ? {
              ...item,
              ...result.photo,
            }
            : item,
        ),
      );

      setSelectedIds((current) => {
        if (!current.includes(renameTarget.id)) {
          return current;
        }
        return current.map((id) =>
          id === renameTarget.id ? result.photo.id : id,
        );
      });
      setFocusId((current) =>
        current === renameTarget.id ? result.photo.id : current,
      );
      setExpandedPhotoId((current) =>
        current === renameTarget.id ? result.photo.id : current,
      );

      closeRenameDialog();
    } catch (error) {
      console.error(error);
      window.alert(t("app.error.rename"));
      setIsRenaming(false);
    }
  }, [closeRenameDialog, renameTarget, renameValue, t]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const exists = photos.some((item) => item.id === contextMenu.photo.id);
    if (!exists) {
      setContextMenu(null);
    }
  }, [contextMenu, photos]);

  useEffect(() => {
    if (displayedPhotos.length === 0) {
      if (selectedIds.length > 0) {
        setSelectedIds([]);
      }
      if (focusId !== null) {
        setFocusId(null);
      }
      return;
    }

    const displayedIdSet = new Set(displayedPhotos.map((photo) => photo.id));
    const filteredSelection = selectedIds.filter((id) =>
      displayedIdSet.has(id),
    );

    if (selectedIds.length === 0) {
      if (focusId && !displayedIdSet.has(focusId)) {
        setFocusId(null);
      }
      return;
    }

    if (filteredSelection.length === 0) {
      const existingSelectedIds = selectedIds.filter((id) =>
        photoIdSet.has(id),
      );

      if (existingSelectedIds.length > 0) {
        setSelectedIds([]);
        if (focusId !== null) {
          setFocusId(null);
        }
        return;
      }

      const fallbackId = displayedPhotos[0]?.id ?? null;
      if (fallbackId) {
        if (!arraysEqual(selectedIds, [fallbackId])) {
          setSelectedIds([fallbackId]);
        }
        if (focusId !== fallbackId) {
          setFocusId(fallbackId);
        }
      } else {
        if (selectedIds.length > 0) {
          setSelectedIds([]);
        }
        if (focusId !== null) {
          setFocusId(null);
        }
      }
      return;
    }

    if (!arraysEqual(selectedIds, filteredSelection)) {
      setSelectedIds(filteredSelection);
    }
    const nextFocus =
      focusId && displayedIdSet.has(focusId)
        ? focusId
        : filteredSelection[filteredSelection.length - 1] ?? null;
    if (nextFocus !== focusId) {
      setFocusId(nextFocus);
    }
  }, [displayedPhotos, focusId, photoIdSet, selectedIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      ) {
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;

      if (contextMenu) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeContextMenu();
        }
        return;
      }

      if (
        (event.key === "?" && !isMeta) ||
        (event.key === "/" && event.shiftKey && !isMeta)
      ) {
        event.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      if (event.key === "Escape") {
        let handled = false;
        if (selectionCount > 0) {
          handled = true;
          setSelectedIds([]);
          setFocusId(null);
        }
        if (showShortcuts) {
          handled = true;
          setShowShortcuts(false);
        }
        if (expandedPhotoId) {
          handled = true;
          setExpandedPhotoId(null);
        }
        if (handled) {
          event.preventDefault();
        }
        return;
      }

      if (showShortcuts) {
        return;
      }

      if (expandedPhotoId) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          if (event.shiftKey) {
            selectEdge("start");
          } else {
            moveSelection(-1);
          }
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          if (event.shiftKey) {
            selectEdge("end");
          } else {
            moveSelection(1);
          }
          return;
        }
      }

      if ((event.key === "o" || event.key === "O") && isMeta) {
        event.preventDefault();
        void handleLoad();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (event.shiftKey) {
          selectEdge("start");
        } else {
          moveSelection(-1);
        }
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (event.shiftKey) {
          selectEdge("end");
        } else {
          moveSelection(1);
        }
        return;
      }

      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        toggleFilter();
        return;
      }

      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        cycleSort();
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectionCount > 0
      ) {
        event.preventDefault();
        handleDeleteSelection();
        return;
      }

      if (event.key === "[" && selectionCount > 0) {
        event.preventDefault();
        applyRelativeRating(selectedPhotos, -1);
        return;
      }

      if (event.key === "]" && selectionCount > 0) {
        event.preventDefault();
        applyRelativeRating(selectedPhotos, 1);
        return;
      }

      if (/^[0-5]$/.test(event.key) && selectionCount > 0) {
        event.preventDefault();
        applyUniformRating(selectedIds, Number(event.key));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    applyRelativeRating,
    applyUniformRating,
    closeContextMenu,
    contextMenu,
    cycleSort,
    expandedPhotoId,
    handleDeleteSelection,
    handleLoad,
    moveSelection,
    selectEdge,
    selectedIds,
    selectedPhotos,
    selectionCount,
    showShortcuts,
    toggleFilter,
  ]);

  useEffect(() => {
    if (!expandedPhotoId) {
      return;
    }
    if (primarySelectedPhoto && primarySelectedPhoto.id !== expandedPhotoId) {
      setExpandedPhotoId(primarySelectedPhoto.id);
    }
    if (!primarySelectedPhoto) {
      setExpandedPhotoId(null);
    }
  }, [expandedPhotoId, primarySelectedPhoto]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktopLayout(event.matches);
    };
    setIsDesktopLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopLayout) {
      setIsResizingPreview(false);
      setPreviewPanelWidth(DEFAULT_PREVIEW_WIDTH);
      resizeStateRef.current = {
        startX: 0,
        startWidth: DEFAULT_PREVIEW_WIDTH,
      };
    }
  }, [isDesktopLayout]);

  useEffect(() => {
    if (!layoutContainerRef.current || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const element = layoutContainerRef.current;
    const observer = new ResizeObserver(() => {
      if (!isDesktopLayout) {
        return;
      }
      const containerWidth = element.getBoundingClientRect().width;
      setPreviewPanelWidth((current) =>
        clampPreviewWidth(current, containerWidth),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isDesktopLayout]);

  useEffect(() => {
    if (!isResizingPreview) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!layoutContainerRef.current || !isDesktopLayout) {
        return;
      }
      const { startX, startWidth } = resizeStateRef.current;
      const delta = event.clientX - startX;
      const containerWidth =
        layoutContainerRef.current.getBoundingClientRect().width;
      const nextWidth = clampPreviewWidth(startWidth - delta, containerWidth);
      setPreviewPanelWidth(nextWidth);
    };

    const stopResizing = () => {
      setIsResizingPreview(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isDesktopLayout, isResizingPreview]);

  const previewLayoutStyle = isDesktopLayout
    ? ({ "--preview-width": `${previewPanelWidth}px` } as CSSProperties & {
      "--preview-width"?: string;
    })
    : undefined;

  const handlePreviewResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDesktopLayout || !layoutContainerRef.current) {
        return;
      }
      event.preventDefault();
      resizeStateRef.current = {
        startX: event.clientX,
        startWidth: previewPanelWidth,
      };
      setIsResizingPreview(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isDesktopLayout, previewPanelWidth],
  );

  const handleDragEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!hasFileItems(event.dataTransfer?.items ?? null)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragOverDropZone(true);
    },
    [],
  );

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!hasFileItems(event.dataTransfer?.items ?? null)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!isDragOverDropZone) {
        setIsDragOverDropZone(true);
      }
    },
    [isDragOverDropZone],
  );

  const handleDragLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const containsFiles = hasFileItems(event.dataTransfer?.items ?? null);
      if (!containsFiles && event.relatedTarget) {
        return;
      }
      event.preventDefault();
      if (containsFiles) {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      } else {
        dragDepthRef.current = 0;
      }
      if (dragDepthRef.current === 0) {
        setIsDragOverDropZone(false);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    async (event: ReactDragEvent<HTMLDivElement>) => {
      if (!hasFileItems(event.dataTransfer?.items ?? null)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOverDropZone(false);
      if (isLoading) {
        return;
      }

      const files = Array.from(event.dataTransfer?.files ?? []) as FileWithPath[];
      const items = Array.from(
        event.dataTransfer?.items ?? [],
      ) as DataTransferItemWithEntry[];
      if (!files.length) {
        return;
      }

      const directoriesFromEntries = items
        .map((item, index) => {
          const entry = item?.webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            const file = files[index];
            return file?.path;
          }
          return null;
        })
        .filter((entry): entry is string => Boolean(entry));

      const candidates = (directoriesFromEntries.length > 0
        ? directoriesFromEntries
        : files.map((file) => file.path)
      )
        .filter((entry): entry is string => Boolean(entry));

      if (!candidates.length) {
        return;
      }

      setIsLoading(true);
      try {
        let handled = false;
        let sawDirectory = directoriesFromEntries.length > 0;
        for (const candidate of candidates) {
          const payload = await window.api.loadFolder(candidate);
          if (payload.directory) {
            sawDirectory = true;
            if (payload.photos.length > 0) {
              applyCollection(payload);
              handled = true;
              break;
            }
          }
        }

        if (!handled && !sawDirectory) {
          window.alert(t("app.dnd.unsupported"));
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    },
    [applyCollection, isLoading, t],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(24,29,36,0.92),_#05070a_68%)] font-sans text-slate-100">
      <div className="flex min-h-screen flex-col gap-5 px-5 py-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1.5">
            <motion.h1
              layout
              className="inline-block bg-gradient-to-r from-sky-500 via-indigo-500 to-indigo-700 bg-clip-text text-2xl font-bold tracking-wide text-transparent"
            >
              PickShot
            </motion.h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_10px_24px_rgba(68,131,255,0.28)] transition hover:shadow-[0_12px_28px_rgba(68,131,255,0.36)] disabled:cursor-progress disabled:opacity-60"
              onClick={() => void handleLoad()}
              disabled={isLoading}
            >
              {t("app.actions.loadFolder")}
            </button>
            <button
              type="button"
              className="rounded-full border border-indigo-300/30 bg-indigo-400/10 px-4 py-2 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-300/20"
              onClick={() => setShowShortcuts(true)}
              title={t("app.tooltips.shortcuts")}
              aria-label={t("app.shortcuts.ariaLabel")}
            >
              <svg
                aria-hidden="true"
                focusable="false"
                className="h-5 w-5 text-indigo-100"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M5 9h14" />
                <path d="M5 13h14" />
                <path d="M9 17h6" />
              </svg>
              <span className="sr-only">{t("app.shortcuts.button")}</span>
            </button>
          </div>
        </header>

        <AnimatePresence initial={false}>
          {directory ? (
            <motion.div
              key="directory"
              className="flex flex-wrap items-center gap-2"
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <span
                key={directory.path}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-400/20 px-3 py-1 text-xs text-indigo-100"
                title={directory.path}
              >
                <button
                  type="button"
                  onClick={handleOpenDirectory}
                  className="rounded-sm bg-transparent p-0 font-semibold text-indigo-50 decoration-indigo-200/60 transition-colors hover:underline hover:text-indigo-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-200"
                  title={`${t("app.actions.openFolder")}: ${directory.path}`}
                  aria-label={`${t("app.actions.openFolder")}: ${directory.label}`}
                >
                  {directory.label}
                </button>
                <span className="text-indigo-200/80">
                  {formatPhotoCount(directory.count)}
                </span>
              </span>
              <button
                type="button"
                onClick={handleClearDirectory}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-indigo-400/40 bg-indigo-500/10 text-indigo-100 transition hover:bg-indigo-400/30 hover:text-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                title={t("app.actions.clearFolder")}
                aria-label={t("app.actions.clearFolder")}
                disabled={isLoading}
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="m4 4 8 8" />
                  <path d="m12 4-8 8" />
                </svg>
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          ref={layoutContainerRef}
          className="grid min-h-0 flex-1 gap-4 lg:[grid-template-columns:minmax(0,_1fr)_var(--preview-width,380px)]"
          style={previewLayoutStyle}
        >
          <section className="flex min-h-0 flex-col rounded-3xl bg-slate-900/80 px-0 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),_0_25px_55px_rgba(0,0,0,0.30)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="flex items-center rounded-full border border-indigo-300/40 bg-indigo-500/10 p-1"
                  role="radiogroup"
                  aria-label={t("app.filter.label")}
                >
                  <button
                    type="button"
                    aria-pressed={filterMode === "all"}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${filterMode === "all"
                      ? "bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-900 shadow-[0_8px_18px_rgba(109,161,255,0.35)]"
                      : "text-indigo-100 hover:bg-indigo-400/20"
                      }`}
                    onClick={() => setFilterMode("all")}
                  >
                    {t("app.filter.all", {
                      count: formatNumber(totalCount),
                    })}
                  </button>
                  <button
                    type="button"
                    aria-pressed={filterMode === "rated"}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${filterMode === "rated"
                      ? "bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-900 shadow-[0_8px_18px_rgba(109,161,255,0.35)]"
                      : "text-indigo-100 hover:bg-indigo-400/20"
                      }`}
                    onClick={() => setFilterMode("rated")}
                    disabled={ratedCount === 0}
                    title={
                      ratedCount === 0
                        ? t("app.filter.ratedDisabled")
                        : undefined
                    }
                  >
                    {t("app.filter.rated", {
                      count: formatNumber(ratedCount),
                    })}
                  </button>
                  <button
                    type="button"
                    aria-pressed={filterMode === "unrated"}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${filterMode === "unrated"
                      ? "bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-900 shadow-[0_8px_18px_rgba(109,161,255,0.35)]"
                      : "text-indigo-100 hover:bg-indigo-400/20"
                      }`}
                    onClick={() => setFilterMode("unrated")}
                    disabled={unratedCount === 0}
                    title={
                      unratedCount === 0
                        ? t("app.filter.unratedDisabled")
                        : undefined
                    }
                  >
                    {t("app.filter.unrated", {
                      count: formatNumber(unratedCount),
                    })}
                  </button>
                </div>
                <SortMenu
                  label={t("app.sort.label")}
                  ariaLabel={t("app.sort.ariaLabel")}
                  value={sortKey}
                  options={sortOptions}
                  onChange={(nextSortKey) => setSortKey(nextSortKey)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                <StarFilterMenu
                  label={t("app.filter.stars.label")}
                  noneLabel={t("app.filter.stars.none")}
                  selectedRatings={ratingFilter}
                  counts={ratingCounts}
                  formatCount={formatNumber}
                  onChange={handleRatingFilterChange}
                  disabled={isStarFilterDisabled}
                />
              </div>
            </div>
            <div className="mt-4 flex min-h-0 flex-1 rounded-2xl bg-slate-950/70">
              <PhotoGrid
                photos={displayedPhotos}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onRate={handleRate}
                onContextMenu={handleContextMenuRequest}
                onExpand={handleExpand}
                emptyContent={emptyGridContent}
                isDragOver={isDragOverDropZone}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              />
            </div>
          </section>
          {isDesktopLayout ? (
            <div className="relative min-h-0 h-full">
              <div className="relative flex h-full w-full flex-col">
                <div
                  className="group absolute left-0 top-0 z-10 flex h-full w-4 -translate-x-1/2 cursor-col-resize items-center"
                  onPointerDown={handlePreviewResizeStart}
                >
                  <hr
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-label={t("app.preview.resizeHandle")}
                    className={`mx-auto h-full w-px rounded-full border-none m-0 transition-colors ${isResizingPreview
                      ? "bg-sky-400/70"
                      : "bg-slate-700/70 group-hover:bg-sky-300/60"
                      }`}
                  />
                </div>
                <div className="flex min-h-0 flex-1">
                  <PhotoPreview
                    photos={selectedPhotos}
                    primaryPhoto={primarySelectedPhoto}
                    onSetRating={applyUniformRating}
                    onDelete={deletePhotos}
                    onExpand={handleExpand}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <PhotoPreview
                photos={selectedPhotos}
                primaryPhoto={primarySelectedPhoto}
                onSetRating={applyUniformRating}
                onDelete={deletePhotos}
                onExpand={handleExpand}
              />
            </div>
          )}
        </div>

        {contextMenu ? (
          <PhotoContextMenu
            position={contextMenu.position}
            selectionCount={selectionCount}
            onClose={closeContextMenu}
            onDelete={handleContextMenuDelete}
            onReveal={handleContextMenuReveal}
            onRename={handleContextMenuRename}
          />
        ) : null}

        {renameTarget ? (
          <RenamePhotoDialog
            key={renameTarget.id}
            name={renameValue}
            onChange={setRenameValue}
            onSubmit={handleRenameSubmit}
            onCancel={closeRenameDialog}
            isSubmitting={isRenaming}
          />
        ) : null}

        {showShortcuts ? (
          <dialog
            className="fixed inset-0 z-30 m-0 flex items-center justify-center bg-[rgba(4,8,18,0.74)] backdrop-blur-xl"
            aria-label={t("app.shortcuts.ariaLabel")}
            open
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "fixed",
              inset: 0,
              margin: 0,
              padding: 0,
              border: "none",
              width: "100%",
              height: "100%",
              overflow: "auto",
            }}
            onCancel={(event) => {
              event.preventDefault();
              setShowShortcuts(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setShowShortcuts(false);
              }
            }}
          >
            <div className="flex min-h-screen w-full items-center justify-center p-6">
              <div className="flex w-full max-w-2xl max-h-full flex-col gap-5 overflow-y-auto rounded-2xl border border-indigo-400/30 bg-slate-900/95 p-6 shadow-[0_24px_45px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-indigo-50">
                    {t("app.shortcuts.title")}
                  </h2>
                  <button
                    type="button"
                    className="rounded-full border border-sky-300/40 bg-sky-300/10 px-4 py-1.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/20"
                    onClick={() => setShowShortcuts(false)}
                  >
                    {t("app.shortcuts.close")}
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <section className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                      {t("app.shortcuts.navigation")}
                    </h3>
                    <ul className="mt-3 space-y-2 text-sm text-indigo-100">
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">← / →</span>
                        <span>{t("app.shortcuts.navigationMove")}</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">
                          Shift + ← / →
                        </span>
                        <span>{t("app.shortcuts.navigationJump")}</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">
                          Shift + ?
                        </span>
                        <span>{t("app.shortcuts.navigationToggle")}</span>
                      </li>
                    </ul>
                  </section>
                  <section className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                      {t("app.shortcuts.rating")}
                    </h3>
                    <ul className="mt-3 space-y-2 text-sm text-indigo-100">
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">1 – 5</span>
                        <span>{t("app.shortcuts.ratingSet")}</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">0</span>
                        <span>{t("app.shortcuts.ratingClear")}</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">[ / ]</span>
                        <span>{t("app.shortcuts.ratingAdjust")}</span>
                      </li>
                    </ul>
                  </section>
                  <section className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                      {t("app.shortcuts.actions")}
                    </h3>
                    <ul className="mt-3 space-y-2 text-sm text-indigo-100">
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">
                          Delete / Backspace
                        </span>
                        <span>{t("app.shortcuts.actionsDelete")}</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">F</span>
                        <span>{t("app.shortcuts.actionsFilter")}</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">
                          ⌘ / Ctrl + O
                        </span>
                        <span>{t("app.shortcuts.actionsLoadFolder")}</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">Esc</span>
                        <span>{t("app.shortcuts.actionsClose")}</span>
                      </li>
                    </ul>
                  </section>
                  <section className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                      {t("app.shortcuts.display")}
                    </h3>
                    <ul className="mt-3 space-y-2 text-sm text-indigo-100">
                      <li className="flex justify-between gap-4">
                        <span className="font-mono text-indigo-200">S</span>
                        <span>{t("app.shortcuts.displayToggleSort")}</span>
                      </li>
                    </ul>
                  </section>
                </div>
              </div>
            </div>
          </dialog>
        ) : null}

        {expandedPhotoId && primarySelectedPhoto ? (
          <dialog
            className="fixed inset-0 z-40 m-0 flex items-center justify-center bg-[rgba(4,8,18,0.9)] backdrop-blur-lg"
            aria-label={t("app.dialog.preview")}
            open
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "fixed",
              inset: 0,
              margin: 0,
              padding: 0,
              border: "none",
              width: "100%",
              height: "100%",
              overflow: "auto",
            }}
            onCancel={(event) => {
              event.preventDefault();
              setExpandedPhotoId(null);
            }}
            onClick={() => setExpandedPhotoId(null)}
            onKeyDown={(event) => {
              if (
                event.key === "Escape" ||
                event.key === "Enter" ||
                event.key === " "
              ) {
                event.preventDefault();
                setExpandedPhotoId(null);
              }
            }}
          >
            <div
              className="flex min-h-screen w-full items-center justify-center p-8"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex max-h-full w-full max-w-[90vw] flex-col items-center justify-center gap-4">
                <img
                  src={primarySelectedPhoto.fileUrl}
                  alt={primarySelectedPhoto.name}
                  className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
                />
                <span className="text-sm text-indigo-100">
                  {primarySelectedPhoto.name}
                </span>
              </div>
            </div>
          </dialog>
        ) : null}
      </div>
    </div>
  );
}

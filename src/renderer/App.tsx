import type { DeletePhotoResult, PhotoMeta } from "@preload/index";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import PhotoContextMenu from "./components/PhotoContextMenu";
import PhotoGrid from "./components/PhotoGrid";
import PhotoPreview from "./components/PhotoPreview";
import RenamePhotoDialog from "./components/RenamePhotoDialog";
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

const DEFAULT_PREVIEW_WIDTH = 380;
const MIN_PREVIEW_WIDTH = 260;
const MAX_PREVIEW_WIDTH = 720;
const MIN_GRID_WIDTH = 360;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const layoutContainerRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef({
    startX: 0,
    startWidth: DEFAULT_PREVIEW_WIDTH,
  });

  const totalCount = photos.length;
  const ratedCount = useMemo(
    () => photos.filter((photo) => photo.rating > 0).length,
    [photos],
  );
  const unratedCount = useMemo(
    () => photos.filter((photo) => photo.rating === 0).length,
    [photos],
  );
  const displayedPhotos = useMemo(() => {
    const filtered =
      filterMode === "rated"
        ? photos.filter((photo) => photo.rating > 0)
        : filterMode === "unrated"
          ? photos.filter((photo) => photo.rating === 0)
          : photos;

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
  }, [filterMode, locale, photos, sortKey]);
  const displayedCount = displayedPhotos.length;

  const selectedPhoto = useMemo(
    () => displayedPhotos.find((photo) => photo.id === selectedId) ?? null,
    [displayedPhotos, selectedId],
  );

  const mergePhotos = useCallback(
    (incoming: PhotoMeta[], incomingRatings?: Record<string, number>) => {
      setPhotos(() => {
        const ratingMap = incomingRatings ?? {};
        const next = incoming
          .map((photo) => toRatedPhoto(photo, ratingMap))
          .sort((a, b) => b.modifiedAt - a.modifiedAt);
        return next;
      });
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

  const handleLoad = useCallback(async () => {
    try {
      setIsLoading(true);
      const payload = await window.api.selectFolder();

      if (!payload.directory) {
        return;
      }

      if (payload.photos.length === 0) {
        return;
      }

      mergePhotos(payload.photos, payload.ratings);
      updateDirectory(payload.directory, payload.photos.length);

      setSelectedId(payload.photos[0]?.id ?? null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [mergePhotos, updateDirectory]);

  const handleRate = useCallback(
    (id: string, rating: number) => {
      const isFilterActive = filterMode === "rated" || filterMode === "unrated";
      const currentFilteredIds = isFilterActive
        ? displayedPhotos.map((photo) => photo.id)
        : [];
      const selectedIndex =
        selectedId && isFilterActive
          ? currentFilteredIds.findIndex((photoId) => photoId === selectedId)
          : -1;
      const nextCandidateId =
        selectedIndex !== -1 ? currentFilteredIds[selectedIndex + 1] : null;
      const previousCandidateId =
        selectedIndex > 0 ? currentFilteredIds[selectedIndex - 1] : null;

      setPhotos((prev) => {
        const next = prev.map((photo) =>
          photo.id === id ? { ...photo, rating } : photo,
        );

        if (isFilterActive) {
          const filteredPhotos = next.filter((photo) =>
            filterMode === "rated" ? photo.rating > 0 : photo.rating === 0,
          );
          if (
            selectedId &&
            !filteredPhotos.some((photo) => photo.id === selectedId)
          ) {
            const candidateOrder = [
              nextCandidateId,
              previousCandidateId,
              filteredPhotos[0]?.id ?? null,
            ].filter((candidate): candidate is string => Boolean(candidate));
            const nextSelection = candidateOrder.find((candidate) =>
              filteredPhotos.some((photo) => photo.id === candidate),
            );
            setSelectedId(nextSelection ?? null);
          }
        }

        return next;
      });

      void window.api.updateRating({ id, rating }).then((result) => {
        if (!result.success && result.message) {
          console.error("Failed to persist rating", result.message);
        }
      });
    },
    [displayedPhotos, filterMode, selectedId],
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleExpand = useCallback((photo: RatedPhoto) => {
    setSelectedId(photo.id);
    setExpandedPhotoId(photo.id);
  }, []);

  const handleContextMenuRequest = useCallback(
    (photo: RatedPhoto, position: { x: number; y: number }) => {
      setSelectedId(photo.id);
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
      setSelectedId((current) => {
        const currentIndex = current
          ? displayedPhotos.findIndex((photo) => photo.id === current)
          : -1;
        const fallbackIndex = offset > 0 ? 0 : displayedPhotos.length - 1;
        const index =
          currentIndex === -1
            ? fallbackIndex
            : (currentIndex + offset + displayedPhotos.length) %
              displayedPhotos.length;
        return displayedPhotos[index]?.id ?? null;
      });
    },
    [displayedPhotos, t],
  );

  const selectEdge = useCallback(
    (direction: "start" | "end") => {
      if (!displayedPhotos.length) return;
      setSelectedId(
        direction === "start"
          ? (displayedPhotos[0]?.id ?? null)
          : (displayedPhotos[displayedPhotos.length - 1]?.id ?? null),
      );
    },
    [displayedPhotos],
  );

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

  const handleDelete = useCallback(
    async (photo: RatedPhoto) => {
      const confirmed = window.confirm(
        t("app.confirm.delete", { name: photo.name }),
      );

      if (!confirmed) {
        return;
      }

      const currentIndex = displayedPhotos.findIndex(
        (item) => item.id === photo.id,
      );
      const nextSelectionId =
        displayedPhotos[currentIndex + 1]?.id ??
        displayedPhotos[currentIndex - 1]?.id ??
        null;

      let result: DeletePhotoResult;
      try {
        result = await window.api.deletePhoto(photo.filePath);
      } catch (error) {
        console.error(error);
        window.alert(t("app.error.deleteUnexpected"));
        return;
      }

      if (!result.success) {
        window.alert(
          result.message
            ? t("app.error.deleteWithReason", { reason: result.message })
            : t("app.error.delete"),
        );
        return;
      }

      let removed = false;

      setPhotos((prev) => {
        const filtered = prev.filter((item) => item.id !== photo.id);
        if (filtered.length !== prev.length) {
          removed = true;
        }
        return filtered;
      });

      if (!removed) {
        window.alert(t("app.error.alreadyDeleted"));
        return;
      }

      setDirectory((prev) => {
        if (!prev || !photo.filePath.startsWith(prev.path)) {
          return prev;
        }
        const nextCount = Math.max(0, prev.count - 1);
        return {
          ...prev,
          count: nextCount,
        };
      });

      setSelectedId((current) => {
        if (current !== photo.id) {
          return current;
        }
        if (nextSelectionId && nextSelectionId !== photo.id) {
          return nextSelectionId;
        }
        return null;
      });

      setExpandedPhotoId((current) =>
        current === photo.id ? (nextSelectionId ?? null) : current,
      );
    },
    [displayedPhotos],
  );

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
    const target = contextMenu.photo;
    closeContextMenu();
    void handleDelete(target);
  }, [closeContextMenu, contextMenu, handleDelete]);

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
    setRenameTarget(target);
  }, [closeContextMenu, contextMenu]);

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

      setSelectedId((current) =>
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
      if (filterMode === "rated") {
        if (selectedId !== null) {
          setSelectedId(null);
        }
      } else if (
        filterMode === "all" &&
        selectedId === null &&
        photos.length > 0
      ) {
        setSelectedId(photos[0]?.id ?? null);
      }
      return;
    }

    const exists = displayedPhotos.some((photo) => photo.id === selectedId);
    if (!exists) {
      setSelectedId(displayedPhotos[0]?.id ?? null);
    }
  }, [displayedPhotos, filterMode, photos, selectedId]);

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
        selectedPhoto
      ) {
        event.preventDefault();
        void handleDelete(selectedPhoto);
        return;
      }

      if (event.key === "[" && selectedPhoto) {
        event.preventDefault();
        const nextRating = Math.max(0, selectedPhoto.rating - 1);
        handleRate(selectedPhoto.id, nextRating);
        return;
      }

      if (event.key === "]" && selectedPhoto) {
        event.preventDefault();
        const nextRating = Math.min(5, selectedPhoto.rating + 1);
        handleRate(selectedPhoto.id, nextRating);
        return;
      }

      if (/^[0-5]$/.test(event.key) && selectedPhoto) {
        event.preventDefault();
        handleRate(selectedPhoto.id, Number(event.key));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeContextMenu,
    contextMenu,
    cycleSort,
    expandedPhotoId,
    handleDelete,
    handleLoad,
    handleRate,
    moveSelection,
    selectEdge,
    selectedPhoto,
    showShortcuts,
    toggleFilter,
  ]);

  useEffect(() => {
    if (!expandedPhotoId) {
      return;
    }
    if (selectedPhoto && selectedPhoto.id !== expandedPhotoId) {
      setExpandedPhotoId(selectedPhoto.id);
    }
    if (!selectedPhoto) {
      setExpandedPhotoId(null);
    }
  }, [expandedPhotoId, selectedPhoto]);

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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(24,29,36,0.92),_#05070a_68%)] font-sans text-slate-100">
      <div className="flex min-h-screen flex-col gap-5 px-5 py-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1.5">
            <motion.h1
              layout
              className="text-2xl font-bold tracking-wide text-slate-100"
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
              className="flex flex-wrap gap-2"
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
                <span className="font-semibold text-indigo-50">
                  {directory.label}
                </span>
                <span className="text-indigo-200/80">
                  {formatPhotoCount(directory.count)}
                </span>
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          ref={layoutContainerRef}
          className="grid min-h-0 flex-1 gap-4 lg:[grid-template-columns:minmax(0,_1fr)_var(--preview-width,380px)]"
          style={previewLayoutStyle}
        >
          <section className="flex min-h-0 flex-col rounded-3xl bg-slate-900/80 px-0 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),_0_25px_55px_rgba(0,0,0,0.30)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="flex items-center rounded-full border border-indigo-300/40 bg-indigo-500/10 p-1"
                  role="radiogroup"
                  aria-label={t("app.filter.label")}
                >
                  <button
                    type="button"
                    aria-pressed={filterMode === "all"}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                      filterMode === "all"
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
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      filterMode === "rated"
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
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      filterMode === "unrated"
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
                <div className="flex items-center gap-2 rounded-full border border-indigo-300/40 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-100">
                  <span className="font-semibold text-indigo-50">
                    {t("app.sort.label")}
                  </span>
                  <select
                    aria-label={t("app.sort.ariaLabel")}
                    value={sortKey}
                    onChange={(event) =>
                      setSortKey(event.target.value as SortKey)
                    }
                    className="appearance-none rounded-full border border-indigo-300/60 bg-indigo-900/60 px-3 py-1 text-xs text-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                  >
                    <option value="modifiedDesc">
                      {t("app.sort.modifiedDesc")}
                    </option>
                    <option value="modifiedAsc">
                      {t("app.sort.modifiedAsc")}
                    </option>
                    <option value="nameAsc">{t("app.sort.nameAsc")}</option>
                    <option value="nameDesc">{t("app.sort.nameDesc")}</option>
                    <option value="ratingDesc">
                      {t("app.sort.ratingDesc")}
                    </option>
                    <option value="ratingAsc">{t("app.sort.ratingAsc")}</option>
                  </select>
                </div>
                {isLoading ? (
                  <span className="inline-flex items-center rounded-full bg-sky-300/20 px-3 py-1 text-[11px] uppercase tracking-wide text-sky-200">
                    {t("app.status.scanning")}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex min-h-0 flex-1 rounded-2xl bg-slate-950/70">
              <PhotoGrid
                photos={displayedPhotos}
                selectedId={selectedId}
                onSelect={handleSelect}
                onRate={handleRate}
                onContextMenu={handleContextMenuRequest}
                onExpand={handleExpand}
                emptyMessage={
                  filterMode === "rated"
                    ? t("app.empty.rated")
                    : filterMode === "unrated"
                      ? t("app.empty.unrated")
                      : t("app.empty.default")
                }
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
                    className={`mx-auto h-full w-px rounded-full border-none m-0 transition-colors ${
                      isResizingPreview
                        ? "bg-sky-400/70"
                        : "bg-slate-700/70 group-hover:bg-sky-300/60"
                    }`}
                  />
                </div>
                <div className="flex min-h-0 flex-1">
                  <PhotoPreview
                    photo={selectedPhoto}
                    onRate={handleRate}
                    onDelete={handleDelete}
                    onExpand={handleExpand}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <PhotoPreview
                photo={selectedPhoto}
                onRate={handleRate}
                onDelete={handleDelete}
                onExpand={handleExpand}
              />
            </div>
          )}
        </div>

        {contextMenu ? (
          <PhotoContextMenu
            position={contextMenu.position}
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

        {expandedPhotoId && selectedPhoto ? (
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
                  src={selectedPhoto.fileUrl}
                  alt={selectedPhoto.name}
                  className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
                />
                <span className="text-sm text-indigo-100">
                  {selectedPhoto.name}
                </span>
              </div>
            </div>
          </dialog>
        ) : null}
      </div>
    </div>
  );
}

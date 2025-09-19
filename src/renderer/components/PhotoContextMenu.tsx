import { useEffect, useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";

interface PhotoContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: () => void;
  onReveal: () => void;
  onRename: () => void;
}

const MENU_GAP = 8;
const MENU_DIMENSIONS = { width: 200, height: 140 };

export default function PhotoContextMenu({
  position,
  onClose,
  onDelete,
  onReveal,
  onRename,
}: PhotoContextMenuProps) {
  const { t } = useI18n();
  const anchoredPosition = useMemo(() => {
    const { innerWidth, innerHeight } = window;
    const maxX = innerWidth - MENU_DIMENSIONS.width - MENU_GAP;
    const maxY = innerHeight - MENU_DIMENSIONS.height - MENU_GAP;
    return {
      x: Math.max(MENU_GAP, Math.min(position.x, maxX)),
      y: Math.max(MENU_GAP, Math.min(position.y, maxY)),
    };
  }, [position]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const handleWindowBlur = () => {
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("resize", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("resize", handleWindowBlur);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50"
      role="presentation"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" ||
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          onClose();
        }
      }}
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute min-w-[200px] rounded-xl border border-slate-500/40 bg-slate-900/95 p-1 text-sm text-slate-100 shadow-xl"
        style={{ top: anchoredPosition.y, left: anchoredPosition.x }}
        role="menu"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-700/60"
          onClick={() => {
            onRename();
          }}
        >
          {t("app.context.rename")}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-700/60"
          onClick={() => {
            onReveal();
          }}
        >
          {t("app.context.reveal")}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-200"
          onClick={() => {
            onDelete();
          }}
        >
          {t("app.context.delete")}
        </button>
      </div>
    </div>
  );
}

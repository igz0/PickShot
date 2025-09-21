import { useEffect, useMemo, useRef, useState } from "react";

interface StarFilterMenuProps {
  label: string;
  noneLabel: string;
  selectedRatings: number[];
  counts: Record<number, number>;
  formatCount: (value: number) => string;
  onChange: (nextRatings: number[]) => void;
  disabled?: boolean;
}

const options = [5, 4, 3, 2, 1, 0];
const STAR = "★";

export default function StarFilterMenu({
  label,
  noneLabel,
  selectedRatings,
  counts,
  formatCount,
  onChange,
  disabled = false,
}: StarFilterMenuProps) {
  const selectionSet = useMemo(
    () => new Set<number>(selectedRatings),
    [selectedRatings],
  );
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeTimeout = useRef<number | null>(null);

  const openMenu = () => {
    if (disabled) return;
    if (closeTimeout.current !== null) {
      window.clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
    setIsOpen(true);
  };

  const scheduleClose = () => {
    if (closeTimeout.current !== null) {
      window.clearTimeout(closeTimeout.current);
    }
    closeTimeout.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimeout.current = null;
    }, 120);
  };

  const handlePointerLeave = () => {
    if (disabled) return;
    scheduleClose();
  };

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
    return () => {
      if (closeTimeout.current !== null) {
        window.clearTimeout(closeTimeout.current);
      }
    };
  }, [disabled]);

  const handleToggle = (value: number) => {
    if (disabled) {
      return;
    }
    const next = new Set(selectionSet);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(Array.from(next).sort((a, b) => b - a));
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center gap-2 ${disabled ? "opacity-60" : ""}`}
      onMouseEnter={openMenu}
      onMouseLeave={handlePointerLeave}
      onFocusCapture={openMenu}
      onBlurCapture={(event) => {
        if (!containerRef.current) return;
        if (!containerRef.current.contains(event.relatedTarget as Node)) {
          scheduleClose();
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={label}
        className={`inline-flex items-center gap-2 rounded-full border border-indigo-300/60 bg-indigo-900/60 mt-1 px-4 py-2 text-xs font-semibold text-indigo-100 transition focus:outline-none focus:ring-2 focus:ring-indigo-400/60 ${disabled ? "pointer-events-none" : "hover:bg-indigo-800/70"}`}
        onClick={() => {
          if (disabled) return;
          if (closeTimeout.current !== null) {
            window.clearTimeout(closeTimeout.current);
            closeTimeout.current = null;
          }
          setIsOpen((prev) => !prev);
        }}
        disabled={disabled}
      >
        <span className="text-[13px] font-semibold text-indigo-100">
          {label}
        </span>
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-full z-20 mt-2 flex w-44 flex-col gap-1 rounded-2xl border border-indigo-400/60 bg-slate-950/95 p-2 shadow-[0_15px_35px_rgba(10,20,60,0.55)] backdrop-blur">
          {options.map((value) => {
            const count = counts[value] ?? 0;
            const checked = selectionSet.has(value);
            const optionId = `star-filter-${value}`;
            const optionLabel = value === 0 ? noneLabel : STAR.repeat(value);
            return (
              <label
                key={value}
                htmlFor={optionId}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors ${checked ? "bg-indigo-500/25" : "hover:bg-indigo-500/10"}`}
              >
                <input
                  id={optionId}
                  type="checkbox"
                  className="h-4 w-4 rounded border-indigo-400/60 bg-indigo-950/80 text-amber-300 focus:ring-1 focus:ring-amber-300"
                  checked={checked}
                  onChange={() => handleToggle(value)}
                  disabled={disabled}
                />
                <span className="font-semibold text-indigo-100">{optionLabel}</span>
                <span className="ml-auto text-xs text-indigo-200/80">
                  {formatCount(count)}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

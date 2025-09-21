import { useEffect, useMemo, useRef, useState } from "react";

type SortMenuOption<Value extends string> = {
  value: Value;
  label: string;
};

interface SortMenuProps<Value extends string> {
  label: string;
  ariaLabel: string;
  value: Value;
  options: Array<SortMenuOption<Value>>;
  onChange: (value: Value) => void;
}

export default function SortMenu<Value extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: SortMenuProps<Value>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeTimeout = useRef<number | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const openMenu = () => {
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
    scheduleClose();
  };

  useEffect(() => {
    return () => {
      if (closeTimeout.current !== null) {
        window.clearTimeout(closeTimeout.current);
      }
    };
  }, []);

  const handleSelect = (nextValue: Value) => {
    onChange(nextValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center"
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
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-3 rounded-full border border-indigo-300/60 bg-indigo-900/60 px-4 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-800/70 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
        onClick={() => {
          if (closeTimeout.current !== null) {
            window.clearTimeout(closeTimeout.current);
            closeTimeout.current = null;
          }
          setIsOpen((prev) => !prev);
        }}
      >
        <span className="text-[13px] font-semibold text-indigo-100">
          {label}
        </span>
        {selectedOption ? (
          <span className="whitespace-nowrap rounded-full bg-indigo-600/20 px-2 py-0.5 text-[11px] font-medium text-indigo-100">
            {selectedOption.label}
          </span>
        ) : null}
      </button>
      {isOpen ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-20 mt-2 flex w-52 flex-col gap-1 rounded-2xl border border-indigo-400/60 bg-slate-950/95 p-2 shadow-[0_15px_35px_rgba(10,20,60,0.55)] backdrop-blur"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs transition-colors ${isSelected
                  ? "bg-indigo-500/25 text-indigo-50 hover:bg-indigo-500/25"
                  : "text-indigo-100 hover:bg-indigo-500/10"
                  }`}
                onClick={() => handleSelect(option.value)}
              >
                <span className="font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

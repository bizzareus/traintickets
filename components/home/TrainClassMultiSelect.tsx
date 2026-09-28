"use client";

import { useEffect, useRef, useState } from "react";
import { AVAILABLE_TRAIN_CLASSES } from "@/lib/trainClasses";
import { cn } from "@/lib/utils";

interface TrainClassMultiSelectProps {
  selectedClasses: string[];
  onChange: (classes: string[]) => void;
  compact?: boolean;
  dropUp?: boolean;
  className?: string;
}

export function TrainClassMultiSelect({
  selectedClasses,
  onChange,
  compact = false,
  dropUp = false,
  className,
}: TrainClassMultiSelectProps) {
  const isAllSelected = selectedClasses.length === 0;
  const selectedSet = new Set(selectedClasses.map((c) => c.toUpperCase()));

  const handleToggle = (code: string) => {
    const upper = code.toUpperCase();
    if (selectedSet.has(upper)) {
      onChange(selectedClasses.filter((c) => c.toUpperCase() !== upper));
    } else {
      onChange([...selectedClasses, upper]);
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  return (
    <TrainClassDropdown
      selectedSet={selectedSet}
      isAllSelected={isAllSelected}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      compact={compact}
      dropUp={dropUp}
      className={className}
    />
  );
}

function TrainClassDropdown({
  selectedSet,
  isAllSelected,
  onToggle,
  onSelectAll,
  compact,
  dropUp,
  className,
}: {
  selectedSet: Set<string>;
  isAllSelected: boolean;
  onToggle: (code: string) => void;
  onSelectAll: () => void;
  compact: boolean;
  dropUp: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = isAllSelected
    ? "All"
    : [...selectedSet].join(", ");

  return (
    <div
      ref={wrapRef}
      className={cn("relative", compact && "w-[116px]", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select train travel classes"
        title={label}
        className={cn(
          "block w-full truncate rounded-md text-left font-semibold touch-manipulation",
          compact
            ? "h-6 border-0 bg-transparent py-0 pl-0 pr-6 text-sm text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25"
            : "border border-gray-300 bg-gray-50 py-3.5 pl-3 pr-8 text-base text-gray-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 sm:py-4",
        )}
      >
        {label}
        <span
          className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-gray-400"
          aria-hidden
        >
          <svg
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Train travel classes"
          aria-multiselectable="true"
          className={cn(
            "absolute z-[60] max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
            compact ? "right-0 w-56" : "inset-x-0",
          )}
        >
          <li role="option" aria-selected={isAllSelected}>
            <button
              type="button"
              onClick={() => {
                onSelectAll();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none touch-manipulation",
                isAllSelected
                  ? "font-bold text-blue-700"
                  : "font-medium text-gray-700",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none",
                  isAllSelected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-transparent",
                )}
              >
                ✓
              </span>
              All classes
            </button>
          </li>
          {AVAILABLE_TRAIN_CLASSES.map((cls) => {
            const active = selectedSet.has(cls.code);
            return (
              <li key={cls.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  title={cls.name}
                  aria-label={cls.name}
                  onClick={() => onToggle(cls.code)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none touch-manipulation",
                    active
                      ? "font-bold text-blue-700"
                      : "font-medium text-gray-700",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none",
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white text-transparent",
                    )}
                  >
                    ✓
                  </span>
                  {cls.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

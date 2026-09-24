"use client";

import { AVAILABLE_TRAIN_CLASSES } from "@/lib/trainClasses";
import { cn } from "@/lib/utils";

interface TrainClassMultiSelectProps {
  selectedClasses: string[];
  onChange: (classes: string[]) => void;
  compact?: boolean;
  className?: string;
}

export function TrainClassMultiSelect({
  selectedClasses,
  onChange,
  compact = false,
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
    <div
      role="group"
      aria-label="Select train travel classes"
      className={cn(
        compact
          ? "flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[260px] sm:max-w-[340px] py-0.5"
          : "flex flex-wrap items-center gap-1.5",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleSelectAll}
        aria-pressed={isAllSelected}
        className={cn(
          "shrink-0 rounded-lg border font-medium transition touch-manipulation",
          compact
            ? "px-2 py-0.5 text-[11px]"
            : "px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm",
          isAllSelected
            ? "border-blue-600 bg-blue-50 text-blue-700 font-semibold shadow-2xs"
            : "border-gray-200 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        All
      </button>

      {AVAILABLE_TRAIN_CLASSES.map((cls) => {
        const active = selectedSet.has(cls.code);
        return (
          <button
            key={cls.code}
            type="button"
            title={cls.name}
            aria-label={cls.name}
            aria-pressed={active}
            onClick={() => handleToggle(cls.code)}
            className={cn(
              "shrink-0 rounded-lg border font-medium transition touch-manipulation",
              compact
                ? "px-2 py-0.5 text-[11px]"
                : "px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm",
              active
                ? "border-blue-600 bg-blue-600 text-white font-semibold shadow-2xs hover:bg-blue-700"
                : "border-gray-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {cls.label}
          </button>
        );
      })}
    </div>
  );
}

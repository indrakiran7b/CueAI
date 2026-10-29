"use client";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
};

/** Pill capsule segmented control (reference: live session mode selector). */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("cue-segmented", className)} role="group" aria-label={ariaLabel ?? label}>
      <span className="cue-segmented-label">{label}</span>
      <div className="cue-segmented-track">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              className={cn("cue-segmented-option", active && "is-active")}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

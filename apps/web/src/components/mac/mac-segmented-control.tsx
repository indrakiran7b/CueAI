"use client";

import { cn } from "@/lib/utils";

export type MacSegment<T extends string> = {
  id: T;
  label: string;
};

export function MacSegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  className,
}: {
  value: T;
  onChange: (id: T) => void;
  segments: MacSegment<T>[];
  className?: string;
}) {
  return (
    <div className={cn("mac-segmented", className)} role="tablist">
      {segments.map((segment) => (
        <button
          key={segment.id}
          type="button"
          role="tab"
          aria-selected={value === segment.id}
          className={cn(value === segment.id && "is-active")}
          onClick={() => onChange(segment.id)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}

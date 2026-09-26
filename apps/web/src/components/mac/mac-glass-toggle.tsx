"use client";

import { cn } from "@/lib/utils";

export function MacGlassToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn("mac-glass-toggle", checked && "is-on")}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

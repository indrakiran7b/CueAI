"use client";

import type { CSSProperties, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function MacGlassInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn("mac-glass-input", className)}
      style={{ WebkitAppRegion: "no-drag", ...props.style } as CSSProperties}
    />
  );
}

export function MacGlassSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("mac-glass-select", className)} {...props}>
      {children}
    </select>
  );
}

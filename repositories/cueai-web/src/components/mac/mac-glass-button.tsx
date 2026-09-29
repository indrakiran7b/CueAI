"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MacGlassButton({
  children,
  className,
  icon,
  accent,
  loading,
  loadingLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  accent?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={cn("mac-glass-btn", accent && "is-accent", loading && "is-loading", className)}
      disabled={Boolean(props.disabled || loading)}
      style={{ WebkitAppRegion: "no-drag", ...props.style } as CSSProperties}
    >
      {icon}
      <span>{loading ? loadingLabel || "Working…" : children}</span>
    </button>
  );
}

export function MacGlassIconButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn("mac-glass-icon-btn", className)} {...props}>
      {children}
    </button>
  );
}

"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function MacGlassPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mac-glass-panel", className)} {...props} />;
}

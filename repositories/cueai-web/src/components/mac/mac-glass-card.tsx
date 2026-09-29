"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function MacGlassCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mac-glass-card", className)} {...props} />;
}

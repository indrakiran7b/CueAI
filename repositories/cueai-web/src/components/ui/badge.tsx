import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "purple";

const variants: Record<BadgeVariant, string> = {
  default: "bg-[var(--surface-active)] text-muted border-[var(--border)]",
  success: "bg-emerald-500/15 text-[var(--success-fg)] border-emerald-500/20",
  warning: "bg-amber-500/15 text-[var(--warning-fg)] border-amber-500/20",
  danger: "bg-[rgba(220,20,60,0.15)] text-[var(--danger-fg)] border-[rgba(220,20,60,0.25)]",
  info: "bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent-border)]",
  purple: "bg-[var(--surface-active)] text-muted border-[var(--border)]",
};

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

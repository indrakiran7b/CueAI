import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  glow?: boolean;
  hover?: boolean;
  children?: ReactNode;
}

export function Card({
  className,
  glass = true,
  glow,
  hover,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5 shadow-[var(--shadow-sm)]",
        glass
          ? "glass border-[var(--glass-border)]"
          : "border-[var(--border)] bg-[var(--surface-solid)]",
        glow && "glow-border",
        hover &&
          "transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold tracking-tight", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted", className)} {...props}>
      {children}
    </p>
  );
}

"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-foreground/90">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--background-elevated)] px-3.5 text-sm text-foreground",
              "placeholder:text-subtle transition-all duration-200",
              "hover:border-[var(--border-glow)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-muted)]",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              error && "border-[var(--cue-danger)] focus:ring-red-500/20",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-subtle">
              {rightIcon}
            </span>
          )}
        </div>
        {error ? (
          <p className="text-xs text-[var(--cue-danger)]">{error}</p>
        ) : hint ? (
          <p className="text-xs text-subtle">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";

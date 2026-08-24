"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger"
  | "gradient";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
};

export type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

export type ButtonLinkProps = CommonProps & {
  href: string;
  type?: never;
  disabled?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-[var(--primary-foreground)] hover:opacity-90 shadow-sm rounded-full",
  secondary:
    "glass text-foreground border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] rounded-full",
  ghost: "bg-transparent text-muted hover:text-foreground hover:bg-[var(--surface-hover)]",
  outline:
    "bg-transparent border border-[var(--border-strong)] text-foreground hover:bg-[var(--surface-hover)] rounded-full",
  danger: "bg-[var(--cue-danger)] text-white hover:bg-[#b91c1c] rounded-full",
  gradient: "btn-gradient text-[var(--primary-foreground)] hover:opacity-90 shadow-sm rounded-full",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-xs gap-1.5 rounded-full",
  md: "h-10 px-5 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-full",
  icon: "h-10 w-10 rounded-full",
};

function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string
) {
  return cn(
    "relative inline-flex items-center justify-center font-medium transition-all duration-200",
    "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
    variants[variant],
    sizes[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps | ButtonLinkProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const classes = buttonClasses(variant, size, className);
    const content = (
      <>
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
          </span>
        )}
        <span className={cn("inline-flex items-center gap-inherit", loading && "invisible")}>
          {children}
        </span>
      </>
    );

    const href = "href" in props ? props.href : undefined;

    if (typeof href === "string" && href.length > 0) {
      const { href: linkHref, ...rest } = props as ButtonLinkProps;
      return (
        <Link
          href={linkHref}
          className={cn(classes, (disabled || loading) && "pointer-events-none opacity-50")}
          aria-disabled={disabled || loading || undefined}
          {...rest}
        >
          {content}
        </Link>
      );
    }

    const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;
    return (
      <button
        ref={ref}
        type={buttonProps.type ?? "button"}
        disabled={Boolean(disabled || loading)}
        className={classes}
        {...buttonProps}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = "Button";

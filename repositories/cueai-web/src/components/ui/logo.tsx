import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Single source of truth for the CueAI brand mark asset. */
export const CUEAI_LOGO_SRC = "/brand/cueai-logo.png";

const MARK_PX = {
  sm: 28,
  md: 32,
  lg: 44,
} as const;

/** Circular CueAI mark only (sidebar collapse, title bar, etc.). */
export function BrandMark({
  className,
  size = "md",
  alt = "",
  priority = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  alt?: string;
  priority?: boolean;
}) {
  const px = MARK_PX[size];
  return (
    <Image
      src={CUEAI_LOGO_SRC}
      alt={alt}
      width={px}
      height={px}
      className={cn("shrink-0 object-contain", className)}
      priority={priority}
      draggable={false}
    />
  );
}

export function Logo({
  className,
  size = "md",
  href = "/",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  href?: string;
}) {
  const text = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
  }[size];

  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 group", className)}
      aria-label="CueAI home"
    >
      <BrandMark size={size} priority />
      <span
        className={cn(
          "font-display font-semibold tracking-tight text-foreground group-hover:opacity-90 transition-opacity",
          text
        )}
      >
        Cue<span className="text-foreground">AI</span>
      </span>
    </Link>
  );
}

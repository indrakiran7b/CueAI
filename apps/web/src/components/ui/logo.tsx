import { cn } from "@/lib/utils";
import Link from "next/link";

export function Logo({
  className,
  size = "md",
  href = "/",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  href?: string;
}) {
  const sizes = {
    sm: { mark: "h-7 w-7", text: "text-base", icon: "text-sm" },
    md: { mark: "h-8 w-8", text: "text-lg", icon: "text-base" },
    lg: { mark: "h-11 w-11", text: "text-2xl", icon: "text-lg" },
  }[size];

  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 group", className)}
      aria-label="CueAI home"
    >
      <span
        className={cn(
          "relative flex items-center justify-center rounded-xl bg-foreground text-[var(--background)]",
          sizes.mark
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-[55%] w-[55%]"
          aria-hidden
        >
          <path
            d="M12 3c-2.8 0-5 1.9-5 4.8 0 1.6.7 3 1.8 4L7 18.2c-.1.4.2.8.6.8h8.8c.4 0 .7-.4.6-.8L15.2 11.8c1.1-1 1.8-2.4 1.8-4C17 4.9 14.8 3 12 3z"
            fill="currentColor"
            opacity="0.95"
          />
          <circle cx="10" cy="7.5" r="1" fill="var(--background)" />
          <circle cx="14" cy="7.5" r="1" fill="var(--background)" />
        </svg>
      </span>
      <span
        className={cn(
          "font-display font-semibold tracking-tight text-foreground group-hover:opacity-90 transition-opacity",
          sizes.text
        )}
      >
        Cue<span className="text-foreground">AI</span>
      </span>
    </Link>
  );
}

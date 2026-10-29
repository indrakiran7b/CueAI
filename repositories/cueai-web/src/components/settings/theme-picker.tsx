"use client";

import type { CSSProperties } from "react";
import { Check, Moon, RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/providers/theme-provider";
import {
  DEFAULT_PALETTE,
  PALETTES,
  getPalette,
  paletteCssVars,
  type ColorMode,
  type PaletteDefinition,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

const SAVE_MESSAGES = {
  idle: "",
  saving: "Saving…",
  saved: "Saved to your account.",
  "local-only": "Applied. Saved on this device only — it will sync to your account when the connection is back.",
} as const;

/** A small dashboard sketch rendered with the palette's own tokens, independent of the active theme. */
function MiniPreview({ palette, mode, current }: { palette: PaletteDefinition; mode: ColorMode; current: boolean }) {
  const vars = paletteCssVars(palette.modes[mode]) as CSSProperties;
  const ModeIcon = mode === "dark" ? Moon : Sun;
  return (
    <div
      aria-hidden
      style={vars}
      className="relative flex h-28 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-solid)] px-2 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-medium text-[var(--foreground-muted)]">
          <ModeIcon className="h-2.5 w-2.5" />
          {mode === "dark" ? "Dark" : "Light"}
          {current && <span className="text-[var(--accent)]">· current</span>}
        </span>
        <span className="h-3 w-7 rounded-full bg-[var(--cta)]" />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex w-1/4 flex-col gap-1.5 border-r border-[var(--border)] p-1.5">
          <span className="h-2 w-full rounded-full bg-[var(--primary-muted)] ring-1 ring-[var(--primary)]" />
          <span className="h-1.5 w-3/4 rounded-full bg-[var(--foreground-subtle)] opacity-60" />
          <span className="h-1.5 w-3/4 rounded-full bg-[var(--foreground-subtle)] opacity-60" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-1.5">
          <span className="h-1.5 w-1/2 rounded-full bg-[var(--foreground)]" />
          <div className="grid flex-1 grid-cols-2 gap-1.5">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-end gap-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-solid)] p-1"
              >
                <span className="w-1/3 rounded-sm bg-[var(--chart-1)]" style={{ height: `${45 + i * 20}%` }} />
                <span className="w-1/3 rounded-sm bg-[var(--chart-2)]" style={{ height: `${75 - i * 15}%` }} />
                <span className="w-1/3 rounded-sm bg-[var(--chart-3)]" style={{ height: `${60 + i * 5}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The three brand colours at their intended 60 / 30 / 10 weight. */
function BalanceStrip({ palette }: { palette: PaletteDefinition }) {
  const weights = ["60%", "30%", "10%"];
  return (
    <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full border border-[var(--border)]">
      {palette.brand.map((c, i) => (
        <span key={c.hex} style={{ backgroundColor: c.hex, width: weights[i] }} />
      ))}
    </div>
  );
}

export function ThemePicker() {
  const { theme, palette, setPalette, resetPalette, paletteSaveState } = useTheme();
  const active = getPalette(palette);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Active theme:{" "}
          <span className="font-medium text-[var(--foreground)]">{active ? active.name : "CueAI Default"}</span>
          <span> · {theme} mode</span>
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void resetPalette()}
          disabled={palette === DEFAULT_PALETTE}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset to Default
        </Button>
      </div>

      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 2xl:grid-cols-3"
      >
        {PALETTES.map((p) => {
          const selected = palette === p.id;
          return (
            <label
              key={p.id}
              className={cn(
                "@container/theme group relative flex min-w-0 cursor-pointer flex-col gap-3 rounded-2xl border-2 bg-[var(--surface)] p-3",
                "transition-[transform,box-shadow,border-color,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[var(--background)]",
                selected
                  ? "border-[var(--primary)] bg-[var(--primary-muted)] shadow-lg"
                  : "border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-md",
              )}
            >
              <input
                type="radio"
                name="cue-palette"
                value={p.id}
                checked={selected}
                onChange={() => void setPalette(p.id)}
                className="sr-only"
              />
              <div className="flex min-w-0 flex-col gap-2 @[22rem]/theme:flex-row">
                <MiniPreview palette={p} mode="light" current={theme === "light"} />
                <MiniPreview palette={p} mode="dark" current={theme === "dark"} />
              </div>
              <BalanceStrip palette={p} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{p.description}</p>
                </div>
                {selected && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary-foreground)]">
                    <Check className="h-3 w-3" aria-hidden />
                    Active
                  </span>
                )}
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label={`${p.name} colours`}>
                {p.brand.map((c) => (
                  <li key={c.hex} className="flex min-w-0 items-center gap-1.5" title={`${c.name} ${c.hex}`}>
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-[var(--border-strong)]"
                      style={{ backgroundColor: c.hex }}
                      aria-hidden
                    />
                    <span className="truncate text-[11px] text-muted">
                      <span className="sr-only">{c.name} </span>
                      {c.hex}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted">Designed for {p.preferredMode} mode · works in both</p>
            </label>
          );
        })}
      </div>

      <p className="min-h-5 text-xs text-muted" aria-live="polite">
        {SAVE_MESSAGES[paletteSaveState]}
      </p>
    </div>
  );
}

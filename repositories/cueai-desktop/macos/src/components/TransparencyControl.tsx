import { Blend, Minus, Plus } from "lucide-react";
import { TRANSPARENCY_MAX, TRANSPARENCY_MIN, TRANSPARENCY_STEP } from "../lib/overlay-transparency";

export type TransparencyControlProps = {
  value: number;
  error: string | null;
  onChange: (value: number) => void;
};

/** Inline transparency row: slider (0–80%), 5-point step buttons and the current percentage. */
export function TransparencyControl({ value, error, onChange }: TransparencyControlProps) {
  return (
    <div className="cue-tp no-drag" role="group" aria-label="Overlay transparency">
      <Blend className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="cue-tp-label">Transparency</span>
      <button
        type="button"
        className="cue-icon"
        aria-label="Decrease transparency"
        disabled={value <= TRANSPARENCY_MIN}
        onClick={() => onChange(value - TRANSPARENCY_STEP)}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="range"
        min={TRANSPARENCY_MIN}
        max={TRANSPARENCY_MAX}
        step={1}
        value={value}
        aria-label="Transparency"
        aria-valuetext={`${value}%`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button
        type="button"
        className="cue-icon"
        aria-label="Increase transparency"
        disabled={value >= TRANSPARENCY_MAX}
        onClick={() => onChange(value + TRANSPARENCY_STEP)}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <output aria-live="polite">{value}%</output>
      {error && (
        <span className="cue-tp-error" role="alert" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}

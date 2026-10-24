"use client";

import type { LayoutPage, ResumeLayout, TextOp } from "@/lib/resume/layout";

const FAMILY: Record<TextOp["family"], string> = {
  helvetica: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  times: "'Times New Roman', Times, 'Liberation Serif', serif",
};

/**
 * Renders one page of the shared resume layout. The PDF route draws the same ops, so the
 * positions and line breaks shown here are the ones in the downloaded file.
 */
export function ResumePageSvg({
  layout,
  page,
  title,
  className,
}: {
  layout: ResumeLayout;
  page: LayoutPage;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className={className}
      role="img"
      aria-label={title}
      style={{ background: "#ffffff" }}
    >
      {page.ops.map((op, i) =>
        op.kind === "rule" ? (
          <line key={i} x1={op.x1} x2={op.x2} y1={op.y} y2={op.y} stroke={op.color} strokeWidth={op.width} />
        ) : (
          <text
            key={i}
            x={op.x}
            y={op.y}
            fontSize={op.size}
            fontFamily={FAMILY[op.family]}
            fontWeight={op.font === "bold" || op.font === "boldItalic" ? 700 : 400}
            fontStyle={op.font === "italic" || op.font === "boldItalic" ? "italic" : "normal"}
            fill={op.color}
            textLength={op.width > 0 ? op.width : undefined}
            lengthAdjust="spacingAndGlyphs"
            style={{ whiteSpace: "pre" }}
          >
            {op.text}
          </text>
        ),
      )}
    </svg>
  );
}

import { useEffect } from "react";

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const EDGES: { dir: Dir; className: string }[] = [
  { dir: "n", className: "resize-edge resize-edge-n" },
  { dir: "s", className: "resize-edge resize-edge-s" },
  { dir: "e", className: "resize-edge resize-edge-e" },
  { dir: "w", className: "resize-edge resize-edge-w" },
  { dir: "ne", className: "resize-edge resize-edge-ne" },
  { dir: "nw", className: "resize-edge resize-edge-nw" },
  { dir: "se", className: "resize-edge resize-edge-se" },
  { dir: "sw", className: "resize-edge resize-edge-sw" },
];

/** IPC-driven edge/corner resize for frameless overlay windows. */
export function ResizeHandles() {
  useEffect(() => {
    const onUp = () => {
      void window.cueai?.endResize?.();
    };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, []);

  return (
    <>
      {EDGES.map(({ dir, className }) => (
        <span
          key={dir}
          className={className}
          aria-hidden
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void window.cueai?.beginResize?.(dir);
          }}
        />
      ))}
    </>
  );
}

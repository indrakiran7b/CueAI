"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type ParallaxSample = { x: number; y: number; scroll: number };

let latest: ParallaxSample = { x: 0, y: 0, scroll: 0 };

/** Read current parallax from the animation loop (no React re-render). */
export function getLandingParallax(): ParallaxSample {
  return latest;
}

/**
 * Pointer + scroll parallax.
 * Writes CSS vars on `root` for DOM layers; keeps a shared sample for the 3D camera.
 */
export function useLandingParallax(root: RefObject<HTMLElement | null>) {
  const [reduced, setReduced] = useState(false);
  const reducedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    setReduced(mq.matches);

    const onMq = () => {
      reducedRef.current = mq.matches;
      setReduced(mq.matches);
      if (mq.matches && root?.current) {
        root.current.style.setProperty("--lp-parx", "0");
        root.current.style.setProperty("--lp-pary", "0");
        root.current.style.setProperty("--lp-pars", "0");
      }
    };
    mq.addEventListener("change", onMq);

    if (mq.matches) return () => mq.removeEventListener("change", onMq);

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    const onMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth) * 2 - 1;
      targetY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const tick = () => {
      if (reducedRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      curX += (targetX - curX) * 0.1;
      curY += (targetY - curY) * 0.1;
      const scroll = window.scrollY;
      latest = { x: curX, y: curY, scroll };

      const el = root?.current;
      if (el) {
        el.style.setProperty("--lp-parx", curX.toFixed(4));
        el.style.setProperty("--lp-pary", curY.toFixed(4));
        el.style.setProperty("--lp-pars", scroll.toFixed(1));
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      mq.removeEventListener("change", onMq);
    };
  }, [root]);

  return { reduced };
}

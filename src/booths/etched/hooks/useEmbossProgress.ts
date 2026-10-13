"use client";
/**
 * Drives the etch animation. One value, window.embossProgress (0..1), updated every frame and
 * broadcast as an "emboss:progress" CustomEvent (lib/sound.ts listens to it).
 * silent = true is for the idle sample loop: it animates but never touches the global value or sounds.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

export function setEmbossProgress(p: number): void {
  window.embossProgress = p;
  window.dispatchEvent(new CustomEvent("emboss:progress", { detail: { progress: p } }));
}

export function useEmbossProgress(onFrame: (p: number) => void, silent = false) {
  const raf = useRef(0);
  const frame = useRef(onFrame);
  frame.current = onFrame;

  const cancel = useCallback(() => cancelAnimationFrame(raf.current), []);

  const start = useCallback(
    (ms: number, onDone?: () => void) => {
      cancelAnimationFrame(raf.current);
      const emit = (p: number) => {
        frame.current(p);
        if (!silent) setEmbossProgress(p);
      };
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        emit(p);
        if (p < 1) raf.current = requestAnimationFrame(tick);
        else onDone?.();
      };
      emit(0);
      raf.current = requestAnimationFrame(tick);
    },
    [silent],
  );

  useEffect(() => cancel, [cancel]);
  return useMemo(() => ({ start, cancel }), [start, cancel]);
}

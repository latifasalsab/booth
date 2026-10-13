"use client";
/**
 * Lenis smooth scrolling, mounted only by pages that want it (never on the fixed /etched main page).
 * Short duration, small inertia. Publishes velocity to lib/scrollState.ts. Disabled with prefers-reduced-motion
 * and fully destroyed on unmount.
 */
import { useEffect } from "react";
import Lenis from "lenis";
import { setScrollVelocity } from "@/lib/scrollState";

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.1, easing: (t: number) => 1 - Math.pow(1 - t, 3), smoothWheel: true });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      setScrollVelocity(lenis.velocity);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      setScrollVelocity(0);
    };
  }, []);
  return null;
}

"use client";
/**
 * Page transitions. CurtainProvider owns a full-screen curtain (charcoal, grain, lime leading edge):
 * it slides in from the bottom (~450ms), runs the action (router.push or a state change),
 * then slides out the top (~450ms). PageFade is the per-route enter animation used by template.tsx.
 * Reduced motion = simple crossfade.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { GRAIN_URI } from "./GrainBackground";

const EASE = [0.2, 0.8, 0.2, 1] as const;

interface CurtainApi {
  /** Navigate with the curtain. */
  go: (href: string) => Promise<void>;
  /** Run any action while the screen is covered. */
  run: (action: () => void | Promise<void>) => Promise<void>;
}
const Ctx = createContext<CurtainApi | null>(null);
/** Returns null outside a provider; callers then fall back to plain behavior. */
export const useCurtain = (): CurtainApi | null => useContext(Ctx);

export function CurtainProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const waiter = useRef<{ path: string; resolve: () => void } | null>(null);

  // Resolve a pending navigation once the new route is mounted.
  useEffect(() => {
    const w = waiter.current;
    if (w && pathname === w.path) {
      waiter.current = null;
      requestAnimationFrame(() => requestAnimationFrame(w.resolve));
    }
  }, [pathname]);

  const run = useCallback(
    async (action: () => void | Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        if (reduced) {
          controls.set({ y: "0%", opacity: 0 });
          await controls.start({ opacity: 1, transition: { duration: 0.18 } });
        } else {
          controls.set({ y: "100%", opacity: 1 });
          await controls.start({ y: "0%", transition: { duration: 0.45, ease: EASE } });
        }
        await action();
        if (reduced) await controls.start({ opacity: 0, transition: { duration: 0.18 } });
        else await controls.start({ y: "-100%", transition: { duration: 0.45, ease: EASE } });
      } finally {
        controls.set({ y: "100%", opacity: 1 });
        busyRef.current = false;
        setBusy(false);
      }
    },
    [controls, reduced],
  );

  const go = useCallback(
    (href: string) =>
      run(
        () =>
          new Promise<void>((resolve) => {
            const path = href.split(/[?#]/)[0];
            if (path === window.location.pathname) return resolve();
            waiter.current = { path, resolve };
            router.push(href);
            window.setTimeout(() => {
              if (waiter.current) {
                waiter.current = null;
                resolve();
              }
            }, 2500);
          }),
      ),
    [run, router],
  );

  return (
    <Ctx.Provider value={{ go, run }}>
      {children}
      <motion.div
        aria-hidden
        initial={{ y: "100%" }}
        animate={controls}
        className="fixed inset-0 z-50 overflow-hidden"
        style={{ background: "#0e0e0f", pointerEvents: busy ? "auto" : "none" }}
      >
        <div className="absolute inset-0 opacity-[.15] mix-blend-overlay" style={{ backgroundImage: GRAIN_URI }} />
        <div className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-accent" />
      </motion.div>
    </Ctx.Provider>
  );
}

/** Route enter animation: fade and rise 12px. Used from a template.tsx. */
export function PageFade({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

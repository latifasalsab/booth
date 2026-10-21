"use client";
/**
 * Page transitions gated on real readiness. State machine: idle -> covering -> loading -> revealing -> idle.
 *  - TransitionLink click: ignored unless idle. The curtain covers (~450ms) while router.push runs at the same time;
 *    the reveal (~450ms) starts only when BOTH the cover animation has finished AND the new route reported ready.
 *  - Route ready = <RouteReady/> (mounted in each route's template): pathname matches, document.fonts.ready (capped at
 *    1.5s), every registered gate settled (useReadyGate, e.g. the plate's first frame), and two animation frames.
 *  - The loader (LOADING + dots + thin indeterminate line) only appears if loading takes longer than ~250ms. After 10s it
 *    offers "Taking longer than usual" with Retry (push again) and Cancel (go back to the page we left).
 *  - Browser back/forward, other route changes and reduced motion use a simple crossfade (~150ms), still gated.
 *  - run(action) uses the same mechanism for state changes (print screen, "Again").
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { GRAIN_URI } from "./GrainBackground";
import Loader from "./Loader";

export type Phase = "idle" | "covering" | "loading" | "revealing";
type Mode = "curtain" | "fade";

const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const COVER_S = 0.45;
const FADE_S = 0.15;
const LOADER_DELAY_MS = 250;
const SLOW_AFTER_MS = 10000;
const GATE_CAP_MS = 8000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frames = (n: number) =>
  new Promise<void>((r) => {
    const step = (i: number) => requestAnimationFrame(() => (i <= 1 ? r() : step(i - 1)));
    step(n);
  });

interface Api {
  phase: Phase;
  /** Navigate with the gated curtain. */
  go: (href: string) => Promise<void>;
  /** Run a state change behind the gated curtain (print screen, Again). */
  run: (action: () => void | Promise<void>) => Promise<void>;
  prefetch: (href: string) => void;
  registerGate: (p: Promise<unknown>) => void;
  reportReady: (path: string) => void;
  settleGates: () => Promise<void>;
}

const Ctx = createContext<Api | null>(null);
/** Null outside the provider; callers then fall back to plain behavior. */
export const useTransitions = (): Api | null => useContext(Ctx);

/**
 * Lets a page delay route readiness. Pass false (hold), true (ready) or a promise. The gate is also released when the
 * component unmounts and after 8s at the latest, so a failing page can never block a transition forever.
 */
export function useReadyGate(gate: Promise<unknown> | boolean): void {
  const t = useTransitions();
  const registerGate = t?.registerGate;
  const deferred = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  if (!deferred.current) {
    let resolve: () => void = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    deferred.current = { promise, resolve };
  }
  useEffect(() => {
    const d = deferred.current;
    if (!d || !registerGate) return;
    registerGate(d.promise);
    return () => d.resolve();
  }, [registerGate]);
  useEffect(() => {
    const d = deferred.current;
    if (!d) return;
    if (gate === true) d.resolve();
    else if (typeof gate === "object") gate.then(() => d.resolve(), () => d.resolve());
  }, [gate]);
}

export function TransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [loader, setLoader] = useState({ show: false, slow: false });
  const phaseRef = useRef<Phase>("idle");
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const lastPath = useRef(pathname);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const reports = useRef(new Map<string, number>());
  const waiters = useRef<{ path: string; since: number; resolve: () => void }[]>([]);
  const gates = useRef(new Set<Promise<unknown>>());
  const timers = useRef<number[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const retryRef = useRef<(() => void) | null>(null);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // ---------------------------------------------------------------- readiness
  const reportReady = useCallback((path: string) => {
    const now = performance.now();
    reports.current.set(path, now);
    waiters.current = waiters.current.filter((w) => {
      if (w.path === path && now >= w.since) {
        w.resolve();
        return false;
      }
      return true;
    });
  }, []);
  const waitReady = useCallback(
    (path: string, since: number) =>
      new Promise<void>((resolve) => {
        if ((reports.current.get(path) ?? -1) >= since) resolve();
        else waiters.current.push({ path, since, resolve });
      }),
    [],
  );
  const registerGate = useCallback((p: Promise<unknown>) => {
    const wrapped: Promise<void> = Promise.race([Promise.resolve(p).then(() => undefined, () => undefined), sleep(GATE_CAP_MS)]).then(() => {
      gates.current.delete(wrapped);
    });
    gates.current.add(wrapped);
  }, []);
  const settleGates = useCallback(async () => {
    while (gates.current.size) await Promise.all(Array.from(gates.current));
  }, []);

  // ---------------------------------------------------------------- loader timers
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setLoader({ show: false, slow: false });
  }, []);
  const armTimers = useCallback(
    (slow: boolean, showNow = false) => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      setLoader({ show: showNow, slow: false });
      if (!showNow) timers.current.push(window.setTimeout(() => setLoader((l) => ({ ...l, show: true })), LOADER_DELAY_MS));
      if (slow) timers.current.push(window.setTimeout(() => setLoader({ show: true, slow: true }), SLOW_AFTER_MS));
    },
    [],
  );

  // ---------------------------------------------------------------- overlay animation
  const cover = useCallback(
    async (mode: Mode) => {
      if (mode === "curtain") {
        controls.set({ y: "100%", opacity: 1 });
        await controls.start({ y: "0%", transition: { duration: COVER_S, ease: EASE } });
      } else {
        controls.set({ y: "0%", opacity: 0 });
        await controls.start({ opacity: 1, transition: { duration: FADE_S } });
      }
    },
    [controls],
  );
  const reveal = useCallback(
    async (mode: Mode) => {
      setPhase("revealing");
      setLoader({ show: false, slow: false });
      if (mode === "curtain") await controls.start({ y: "-100%", transition: { duration: COVER_S, ease: EASE } });
      else await controls.start({ opacity: 0, transition: { duration: FADE_S } });
      controls.set({ y: "100%", opacity: 1 });
      setPhase("idle");
    },
    [controls, setPhase],
  );

  // ---------------------------------------------------------------- navigation with the curtain
  const go = useCallback(
    async (href: string) => {
      if (phaseRef.current !== "idle") return; // double clicks and clicks during a transition are ignored
      const path = href.split(/[?#]/)[0];
      const from = pathRef.current;
      if (path === from) return;
      const mode: Mode = reducedRef.current ? "fade" : "curtain";
      setPhase("covering");
      const ready = waitReady(path, performance.now());
      const covered = cover(mode);
      router.push(href); // at the same time as the cover animation
      await covered;
      setPhase("loading");
      armTimers(true);
      retryRef.current = () => {
        router.push(href);
        armTimers(true, true);
      };
      const outcome = await new Promise<"ready" | "cancel">((resolve) => {
        cancelRef.current = () => resolve("cancel");
        void ready.then(() => resolve("ready"));
      });
      cancelRef.current = null;
      retryRef.current = null;
      clearTimers();
      if (outcome === "cancel") {
        const back = waitReady(from, performance.now());
        router.push(from);
        await Promise.race([back, sleep(3000)]);
      }
      await reveal(mode);
    },
    [router, cover, reveal, waitReady, armTimers, clearTimers, setPhase],
  );

  /** State changes (print screen, Again) go through the same gated cover. */
  const run = useCallback(
    async (action: () => void | Promise<void>) => {
      if (phaseRef.current !== "idle") return;
      const mode: Mode = reducedRef.current ? "fade" : "curtain";
      setPhase("covering");
      await cover(mode);
      setPhase("loading");
      armTimers(false);
      try {
        await action();
        await sleep(0); // let React commit the new view and let its gates register
        await frames(2);
        await settleGates();
      } catch {
        /* reveal anyway */
      } finally {
        clearTimers();
      }
      await reveal(mode);
    },
    [cover, reveal, armTimers, clearTimers, settleGates, setPhase],
  );

  // Route changes that did not come from TransitionLink get a crossfade, still gated.
  useEffect(() => {
    const prev = lastPath.current;
    lastPath.current = pathname;
    if (prev === pathname || phaseRef.current !== "idle") return;
    void (async () => {
      setPhase("loading");
      controls.set({ y: "0%", opacity: 1 });
      armTimers(false);
      await Promise.race([waitReady(pathname, performance.now() - 200), sleep(12000)]);
      clearTimers();
      await reveal("fade");
    })();
  }, [pathname, controls, setPhase, armTimers, clearTimers, waitReady, reveal]);

  // Browser back/forward: no curtain, a 150ms crossfade, still waiting for the route to be ready.
  useEffect(() => {
    const onPop = () => {
      if (phaseRef.current !== "idle") return;
      const path = window.location.pathname;
      if (path === pathRef.current) return;
      void (async () => {
        setPhase("covering");
        const ready = waitReady(path, performance.now());
        await cover("fade");
        setPhase("loading");
        armTimers(false);
        await Promise.race([ready, sleep(12000)]);
        clearTimers();
        await reveal("fade");
      })();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [cover, reveal, waitReady, armTimers, clearTimers, setPhase]);

  const prefetch = useCallback((href: string) => router.prefetch(href), [router]);
  const api = useMemo<Api>(
    () => ({ phase, go, run, prefetch, registerGate, reportReady, settleGates }),
    [phase, go, run, prefetch, registerGate, reportReady, settleGates],
  );

  const actionable = !!retryRef.current && !!cancelRef.current;
  return (
    <Ctx.Provider value={api}>
      {children}
      <motion.div
        aria-hidden={!(loader.show && phase === "loading")}
        initial={{ y: "100%" }}
        animate={controls}
        className="fixed inset-0 z-50 overflow-hidden"
        style={{ background: "#0e0e0f", pointerEvents: phase === "idle" ? "none" : "auto" }}
      >
        <div className="absolute inset-0 opacity-[.15] mix-blend-overlay" style={{ backgroundImage: GRAIN_URI }} />
        <div className="absolute inset-x-0 top-0 h-[2px] bg-accent" />
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-accent" />
        {loader.show && phase === "loading" && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader slow={loader.slow} onRetry={actionable ? () => retryRef.current?.() : undefined} onCancel={actionable ? () => cancelRef.current?.() : undefined} />
          </div>
        )}
      </motion.div>
    </Ctx.Provider>
  );
}

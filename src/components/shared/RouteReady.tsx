"use client";
/**
 * Route-ready signal. Mount <RouteReady /> in each route's template: once the pathname is current, fonts are ready (capped
 * at 1.5s), every gate registered with useReadyGate has settled and two animation frames have passed, it tells the
 * TransitionProvider that this route may be revealed. <PageReady /> is a gate for simple pages: resolved after first paint.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useReadyGate, useTransitions } from "./TransitionProvider";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frames = (n: number) =>
  new Promise<void>((r) => {
    const step = (i: number) => requestAnimationFrame(() => (i <= 1 ? r() : step(i - 1)));
    step(n);
  });

export default function RouteReady() {
  const pathname = usePathname();
  const t = useTransitions();
  const settleGates = t?.settleGates;
  const reportReady = t?.reportReady;
  useEffect(() => {
    if (!settleGates || !reportReady) return;
    let alive = true;
    void (async () => {
      await Promise.race([document.fonts.ready, sleep(1500)]);
      await settleGates(); // heavy pages (the plate's first frame, lazy chunks) register gates
      await frames(2);
      if (alive) reportReady(pathname);
    })();
    return () => {
      alive = false;
    };
  }, [pathname, settleGates, reportReady]);
  return null;
}

/** Gate for pages without heavy content: ready after their first paint. */
export function PageReady() {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPainted(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  useReadyGate(painted);
  return null;
}

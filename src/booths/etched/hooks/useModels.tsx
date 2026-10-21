"use client";
/**
 * Model status context (loading / ready / failed). When the browser is idle the provider warms up the face landmarker
 * and the segmenter in the background. useModels() returns { landmarker, segmenter, overall }.
 */
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getServerSnapshot, getSnapshot, subscribe, warmUp, type ModelSnapshot } from "../lib/models";

const Ctx = createContext<ModelSnapshot>(getServerSnapshot());
export const useModels = (): ModelSnapshot => useContext(Ctx);

export function ModelsProvider({ children }: { children: ReactNode }) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const start = () => void warmUp();
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(start, 400);
    return () => window.clearTimeout(t);
  }, []);
  return <Ctx.Provider value={snap}>{children}</Ctx.Provider>;
}

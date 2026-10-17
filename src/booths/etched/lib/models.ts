/**
 * Warm-up and status of the on-device models (face landmarker + person segmenter). warmUp() starts both lazy loaders
 * (and the shared WASM) in the background exactly once; the status is a tiny external store (see hooks/useModels.tsx).
 */
import { getFaceLandmarker } from "./faceLandmarker";
import { getSegmenter } from "./segmenter";

export type ModelState = "idle" | "loading" | "ready" | "failed";
export interface ModelSnapshot {
  landmarker: ModelState;
  segmenter: ModelState;
  overall: ModelState;
}

const IDLE: ModelSnapshot = { landmarker: "idle", segmenter: "idle", overall: "idle" };
let snap: ModelSnapshot = IDLE;
const listeners = new Set<() => void>();
let started: Promise<void> | null = null;

const overallOf = (a: ModelState, b: ModelState): ModelState => {
  if (a === "loading" || b === "loading") return "loading";
  if (a === "idle" && b === "idle") return "idle";
  if (a === "failed" || b === "failed") return "failed";
  return "ready";
};
function update(p: Partial<ModelSnapshot>) {
  const next = { ...snap, ...p };
  next.overall = overallOf(next.landmarker, next.segmenter);
  snap = next;
  listeners.forEach((l) => l());
}

export const getSnapshot = (): ModelSnapshot => snap;
export const getServerSnapshot = (): ModelSnapshot => IDLE;
export const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function warmUp(): Promise<void> {
  if (started) return started;
  update({ landmarker: "loading", segmenter: "loading" });
  started = Promise.all([
    getFaceLandmarker().then((m) => update({ landmarker: m ? "ready" : "failed" })),
    getSegmenter().then((m) => update({ segmenter: m ? "ready" : "failed" })),
  ]).then(() => undefined);
  return started;
}

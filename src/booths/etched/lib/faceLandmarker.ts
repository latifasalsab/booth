/**
 * Lazy, shared MediaPipe FaceLandmarker (client only). The package is imported dynamically, the WASM runtime is served
 * from /mediapipe/wasm (copied by scripts/copy-mediapipe.mjs), the model from /models/face_landmarker.task when that file
 * exists, otherwise from the public MediaPipe bucket. GPU delegate first, CPU as fallback. Returns null on any failure
 * so callers can fall back to the edge-based strokes.
 */
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "./faceStrokes";

const LOCAL_MODEL = "/models/face_landmarker.task";
const REMOTE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_PATH = "/mediapipe/wasm";

let instance: Promise<FaceLandmarker | null> | null = null;

async function loadVisionImpl() {
  const mod = await import("@mediapipe/tasks-vision");
  const fileset = await mod.FilesetResolver.forVisionTasks(WASM_PATH);
  return { mod, fileset };
}
export type Vision = Awaited<ReturnType<typeof loadVisionImpl>>;
let visionPromise: Promise<Vision | null> | null = null;

/** Shared WASM runtime for every MediaPipe task (face landmarker, segmenter). Null on failure or on the server. */
export function loadVision(): Promise<Vision | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!visionPromise) {
    visionPromise = loadVisionImpl().catch(() => {
      visionPromise = null;
      return null;
    });
  }
  return visionPromise;
}

/** Local model file when it exists in /public, otherwise the public bucket URL. */
export async function pickModel(local: string, remote: string): Promise<string> {
  try {
    const r = await fetch(local, { method: "HEAD" });
    if (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) return local;
  } catch {
    /* offline or blocked: use the remote model */
  }
  return remote;
}

async function create(): Promise<FaceLandmarker | null> {
  try {
    const vision = await loadVision();
    if (!vision) return null;
    const modelAssetPath = await pickModel(LOCAL_MODEL, REMOTE_MODEL);
    const make = (delegate: "GPU" | "CPU") =>
      vision.mod.FaceLandmarker.createFromOptions(vision.fileset, { baseOptions: { modelAssetPath, delegate }, runningMode: "IMAGE", numFaces: 1 });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  } catch {
    return null;
  }
}

export function getFaceLandmarker(): Promise<FaceLandmarker | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!instance) {
    instance = create().then((lm) => {
      if (!lm) instance = null; // allow a retry next time
      return lm;
    });
  }
  return instance;
}

/** 478 normalized landmarks (x, y in 0..1 of the canvas) for the first face, or null if none was found. */
export async function detectLandmarks(canvas: HTMLCanvasElement): Promise<Landmark[] | null> {
  const lm = await getFaceLandmarker();
  if (!lm) return null;
  try {
    return lm.detect(canvas).faceLandmarks[0] ?? null;
  } catch {
    return null;
  }
}

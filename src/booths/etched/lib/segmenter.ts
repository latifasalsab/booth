/**
 * Person segmentation with the MediaPipe multiclass selfie model (0 background, 1 hair, 2 body-skin, 3 face-skin,
 * 4 clothes, 5 others). Lazy dynamic import, shared WASM setup with the face landmarker, GPU then CPU, one shared
 * instance. The model is read from /models/selfie_multiclass_256x256.tflite if that file exists, otherwise downloaded
 * once from the public MediaPipe bucket. Returns null on any failure (callers fall back to basic mode).
 */
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { loadVision, pickModel } from "./faceLandmarker";

const LOCAL_MODEL = "/models/selfie_multiclass_256x256.tflite";
const REMOTE_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

export interface ClassMask {
  w: number;
  h: number;
  data: Uint8Array;
}

let instance: Promise<ImageSegmenter | null> | null = null;

async function create(): Promise<ImageSegmenter | null> {
  try {
    const vision = await loadVision();
    if (!vision) return null;
    const modelAssetPath = await pickModel(LOCAL_MODEL, REMOTE_MODEL);
    const make = (delegate: "GPU" | "CPU") =>
      vision.mod.ImageSegmenter.createFromOptions(vision.fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  } catch {
    return null;
  }
}

export function getSegmenter(): Promise<ImageSegmenter | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!instance) {
    instance = create().then((s) => {
      if (!s) instance = null; // allow a retry next time
      return s;
    });
  }
  return instance;
}

/** Class id per pixel (256x256 for the selfie model) for the whole canvas, or null if segmentation is unavailable. */
export async function segmentPerson(canvas: HTMLCanvasElement): Promise<ClassMask | null> {
  const seg = await getSegmenter();
  if (!seg) return null;
  try {
    const res = seg.segment(canvas);
    const mask = res.categoryMask;
    if (!mask) {
      res.close();
      return null;
    }
    const out = { w: mask.width, h: mask.height, data: mask.getAsUint8Array().slice() };
    res.close();
    return out;
  } catch {
    return null;
  }
}

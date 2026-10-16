"use client";
/**
 * Camera access. start() asks for the front camera; stop() releases every track (also on unmount).
 * capture(flip) returns a 4:5 portrait crop of the current frame. The preview is never mirrored; the ONLY flip is the
 * user's explicit "Flip view" toggle, and the capture is flipped the same way so the photo always matches the preview.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "starting" | "live" | "denied" | "unsupported";

const PHOTO_W = 960;
const PHOTO_H = 1200;

/** Center-crop any image/video source to the 4:5 photo canvas. Used for camera frames and uploads. */
export function cropToPortrait(src: CanvasImageSource, sw: number, sh: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PHOTO_W;
  c.height = PHOTO_H;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const target = PHOTO_W / PHOTO_H;
  let cw = sw;
  let ch = sh;
  if (sw / sh > target) cw = sh * target;
  else ch = sw / target;
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, PHOTO_W, PHOTO_H);
  return c;
}

/** Horizontal flip of a canvas (used only for the explicit Flip view toggle). */
export function flipCanvasX(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  if (!ctx) return src;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runId = useRef(0);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const stop = useCallback(() => {
    runId.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async (): Promise<CameraStatus> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return "unsupported";
    }
    const id = ++runId.current;
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      if (id !== runId.current) {
        stream.getTracks().forEach((t) => t.stop());
        return "idle";
      }
      streamRef.current = stream;
      setStatus("live");
      return "live";
    } catch {
      if (id === runId.current) setStatus("denied");
      return "denied";
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (status === "live" && v && streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  }, [status]);

  useEffect(() => () => stop(), [stop]);

  const capture = useCallback((flip = false): HTMLCanvasElement | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const shot = cropToPortrait(v, v.videoWidth, v.videoHeight);
    return flip ? flipCanvasX(shot) : shot;
  }, []);

  return { videoRef, status, start, stop, capture };
}

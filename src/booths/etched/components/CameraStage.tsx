"use client";
/**
 * Left-side media area for CAMERA, COUNTDOWN and REVIEW: live preview or captured photo sitting directly on the
 * page background (rounded, drop-shadow), oval face guide, live dot, 3-2-1 digits and the capture flash.
 * The preview is never mirrored unless the user turns on Flip view.
 */
import type { ReactNode, RefObject } from "react";
import type { CameraStatus } from "../hooks/useCamera";

interface Props {
  mode: "camera" | "countdown" | "review";
  videoRef: RefObject<HTMLVideoElement>;
  photoUrl: string | null;
  count: number | null;
  flash: boolean;
  status: CameraStatus;
  /** Optional layer drawn over the media (the ?debug=1 overlay). */
  overlay?: ReactNode;
  /** Explicit user toggle: show the preview flipped horizontally. */
  flip?: boolean;
}

export default function CameraStage({ mode, videoRef, photoUrl, count, flash, status, overlay, flip = false }: Props) {
  const review = mode === "review";
  return (
    <div className="etb-shadow relative overflow-hidden rounded-[22px] bg-black/50" style={{ aspectRatio: "4 / 5", height: "100%", maxWidth: "100%" }}>
      {!review && <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" aria-label="Camera preview" style={flip ? { transform: "scaleX(-1)" } : undefined} />}
      {review && photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="Your captured photo" className="h-full w-full object-cover" />
      )}

      {!review && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-[14%] inset-y-[9%] rounded-[50%] border border-white/70" style={{ boxShadow: "0 0 0 9999px rgb(0 0 0 / .28)" }} />
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1 font-dot text-[11px] tracking-[.12em] text-white">
            <span className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-accent" : "bg-white/40"}`} />
            {status === "live" ? "LIVE" : "STARTING"}
          </div>
          {status === "starting" && <p className="absolute inset-x-0 bottom-6 text-center font-dot text-[12px] tracking-[.12em] text-white/80">STARTING CAMERA…</p>}
        </>
      )}

      {mode === "countdown" && count !== null && (
        <div className="absolute inset-0 grid place-items-center" aria-live="assertive">
          <span
            key={count}
            className="font-dot leading-none"
            style={{ fontSize: "clamp(96px,22vw,220px)", color: count === 1 ? "rgb(var(--accent))" : "#fff", textShadow: "0 2px 26px rgb(0 0 0 / .6)" }}
          >
            {count}
          </span>
        </div>
      )}

      {overlay}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: flash ? 0.85 : 0, transition: `opacity ${flash ? 40 : 260}ms linear` }} />
    </div>
  );
}

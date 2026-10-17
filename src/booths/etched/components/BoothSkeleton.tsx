"use client";
/** Shown while a heavy booth chunk loads: the shell appears fast; the route is held (useReadyGate) until this unmounts. */
import { useReadyGate } from "@/components/shared/TransitionProvider";

export default function BoothSkeleton({ label = "Warming up the press..." }: { label?: string }) {
  useReadyGate(false);
  return (
    <div className="grid h-dvh place-items-center">
      <p className="font-dot text-[12px] tracking-[.2em] text-muted">{label}</p>
    </div>
  );
}

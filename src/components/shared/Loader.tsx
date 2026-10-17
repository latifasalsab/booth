"use client";
/**
 * Loader used by the transition curtain and by loading.tsx: Doto "LOADING" with three animated dots and a thin
 * indeterminate progress line (accent allowed here, thin). Calm, no bounce. With slow = true it shows
 * "Taking longer than usual" and, when handlers are given, Retry and Cancel.
 */
import { GRAIN_URI } from "./GrainBackground";

interface Props {
  slow?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
}

export default function Loader({ slow = false, onRetry, onCancel }: Props) {
  return (
    <div className="flex flex-col items-center gap-4 text-ink" role="status" aria-live="polite">
      <p className="loader-label">
        LOADING
        <span className="loader-dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
      <div className="loader-line" aria-hidden />
      {slow && (
        <div className="mt-2 flex flex-col items-center gap-3">
          <p className="text-sm text-muted">Taking longer than usual</p>
          {(onRetry || onCancel) && (
            <div className="flex gap-2">
              {onRetry && (
                <button type="button" className="loader-btn" onClick={onRetry}>
                  Retry
                </button>
              )}
              {onCancel && (
                <button type="button" className="loader-btn" onClick={onCancel}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Full-screen version: charcoal with grain, centered loader. Used by the root loading.tsx. */
export function LoaderScreen() {
  return (
    <div className="relative grid min-h-dvh place-items-center" style={{ background: "rgb(var(--bg))" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[.15] mix-blend-overlay" style={{ backgroundImage: GRAIN_URI }} />
      <div className="relative">
        <Loader />
      </div>
    </div>
  );
}

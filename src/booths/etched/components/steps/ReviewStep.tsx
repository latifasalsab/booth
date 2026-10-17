/** REVIEW: continue to the etch or retake. Shows the "no clear face" message when the edge pass fails. */
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";

interface Props {
  error: string | null;
  busy?: boolean;
  /** Models still loading: show the small note. */
  loadingNote?: boolean;
  /** Shown when the detailed analysis is unavailable. */
  note?: string | null;
  onContinue: () => void;
  onRetake: () => void;
}

export default function ReviewStep({ error, busy = false, loadingNote = false, note = null, onContinue, onRetake }: Props) {
  return (
    <>
      <KioskDisplay>
        <h2 className="font-display text-[clamp(26px,2.6vw,36px)] leading-[.95]">Looks good?</h2>
        <p className="mt-2 text-[12px] leading-snug opacity-80">Continue to etch this photo into the plate, or retake it.</p>
        {loadingNote && <p className="notice mt-3">Loading face analysis...</p>}
        {note && <p className="notice mt-3">{note}</p>}
        {error && (
          <p role="alert" className="notice mt-3">
            {error}
          </p>
        )}
      </KioskDisplay>
      <KioskFooter>
        <SteelButton led={!error} disabled={busy} onClick={onContinue} className="flex-1">
          {busy ? "Reading your face…" : "Looks good? Continue"}
        </SteelButton>
        <SteelButton variant="ghost" disabled={busy} onClick={onRetake}>
          Retake
        </SteelButton>
      </KioskFooter>
    </>
  );
}

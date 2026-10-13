/** REVIEW: continue to the etch or retake. Shows the "no clear face" message when the edge pass fails. */
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";

interface Props {
  error: string | null;
  onContinue: () => void;
  onRetake: () => void;
}

export default function ReviewStep({ error, onContinue, onRetake }: Props) {
  return (
    <>
      <KioskDisplay>
        <h2 className="font-display text-[clamp(26px,2.6vw,36px)] leading-[.95]">Looks good?</h2>
        <p className="mt-2 text-[12px] leading-snug opacity-80">Continue to etch this photo into the plate, or retake it.</p>
        {error && (
          <p role="alert" className="notice mt-3">
            {error}
          </p>
        )}
      </KioskDisplay>
      <KioskFooter>
        <SteelButton led={!error} onClick={onContinue} className="flex-1">
          Looks good? Continue
        </SteelButton>
        <SteelButton variant="ghost" onClick={onRetake}>
          Retake
        </SteelButton>
      </KioskFooter>
    </>
  );
}

/** ETCH: progress readout with a lime progress line. The main key is disabled while the plate is pressed. */
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";

export default function EtchStep({ progress }: { progress: number }) {
  return (
    <>
      <KioskDisplay>
        <h2 className="font-display text-[clamp(26px,2.6vw,36px)] leading-[.95]">Etching your plate</h2>
        <p className="mt-2 font-dot text-[13px] tracking-[.14em]">{String(progress).padStart(3, "0")}%</p>
        <div className="progress-track mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Etch progress">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </KioskDisplay>
      <KioskFooter>
        <SteelButton disabled className="flex-1">
          Etching…
        </SteelButton>
      </KioskFooter>
    </>
  );
}

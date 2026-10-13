/** COUNTDOWN: nothing to press, the main key is disabled. */
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";

export default function CountdownStep({ count }: { count: number | null }) {
  return (
    <>
      <KioskDisplay>
        <h2 className="font-display text-[clamp(26px,2.6vw,36px)] leading-[.95]">Hold still</h2>
        <p className="mt-2 font-dot text-[44px] leading-none" aria-hidden>
          {count ?? "·"}
        </p>
      </KioskDisplay>
      <KioskFooter>
        <SteelButton disabled className="flex-1">
          Hold still
        </SteelButton>
      </KioskFooter>
    </>
  );
}

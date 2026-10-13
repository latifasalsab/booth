/** CAMERA: take the photo or cancel. */
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";

interface Props {
  ready: boolean;
  onCapture: () => void;
  onCancel: () => void;
}

export default function CameraStep({ ready, onCapture, onCancel }: Props) {
  return (
    <>
      <KioskDisplay>
        <h2 className="font-display text-[clamp(26px,2.6vw,36px)] leading-[.95]">Frame your face</h2>
        <p className="mt-2 text-[12px] leading-snug opacity-80">Fit your head inside the oval, face the light and keep still. A 3-2-1 countdown follows.</p>
      </KioskDisplay>
      <KioskFooter>
        <SteelButton led={ready} disabled={!ready} onClick={onCapture} className="flex-1">
          Take photo
        </SteelButton>
        <SteelButton variant="ghost" onClick={onCancel}>
          Cancel
        </SteelButton>
      </KioskFooter>
    </>
  );
}

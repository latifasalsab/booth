/** CAMERA: take the photo or cancel. */
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";

interface Props {
  ready: boolean;
  flip: boolean;
  onFlip: (v: boolean) => void;
  onCapture: () => void;
  onCancel: () => void;
}

export default function CameraStep({ ready, flip, onFlip, onCapture, onCancel }: Props) {
  return (
    <>
      <KioskDisplay>
        <h2 className="font-display text-[clamp(26px,2.6vw,36px)] leading-[.95]">Frame your face</h2>
        <p className="mt-2 text-[12px] leading-snug opacity-80">Fit your head inside the oval, face the light and keep still. A 3-2-1 countdown follows.</p>
        <button type="button" role="switch" aria-checked={flip} className="mini mt-3" onClick={() => onFlip(!flip)}>
          Flip view: {flip ? "on" : "off"}
        </button>
        <p className="mt-1.5 text-[11px] leading-snug opacity-75">Only if your camera shows a mirrored picture. The photo is saved exactly as you see it.</p>
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

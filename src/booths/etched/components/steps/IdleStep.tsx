"use client";
/** IDLE: heading, privacy note, 3-step guide, plates counter, slow ticker. Start camera or upload a photo. */
import { useRef } from "react";
import SteelButton from "../SteelButton";
import { KioskDisplay, KioskFooter } from "../KioskPanel";

const GUIDE = ["Snap", "Etch", "Print"];
const TICKER = "FACE THE LIGHT · KEEP STILL · PROCESSED ON DEVICE · ";

interface Props {
  plates: number;
  notice: string | null;
  onStart: () => void;
  onUpload: (file: File) => void;
}

export default function IdleStep({ plates, notice, onStart, onUpload }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <KioskDisplay>
        <div className="flex h-full flex-col justify-between gap-4">
          <div>
            <h2 className="font-display text-[clamp(30px,3.2vw,44px)] leading-[.95]">Press your face into silver</h2>
            <p className="mt-2 text-[12px] leading-snug opacity-80">Processed on your device. Nothing is uploaded.</p>
            {notice && (
              <p role="alert" className="notice mt-3">
                {notice}
              </p>
            )}
          </div>
          <ol className="guide" aria-label="How it works">
            {GUIDE.map((g, i) => (
              <li key={g} className="guide-step">
                <span className="guide-badge font-dot" data-active={i === 0}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] font-semibold">{g}</span>
              </li>
            ))}
          </ol>
          <div>
            <p className="font-dot text-[12px] tracking-[.14em]">PLATES ETCHED {String(plates).padStart(3, "0")}</p>
            <div className="ticker mt-2 font-dot text-[11px] tracking-[.12em]" aria-hidden>
              <div className="ticker-track">
                <span>{TICKER.repeat(2)}</span>
                <span>{TICKER.repeat(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </KioskDisplay>
      <KioskFooter>
        <SteelButton led onClick={onStart} className="flex-1">
          Start
        </SteelButton>
        <SteelButton variant="ghost" onClick={() => fileRef.current?.click()}>
          Upload photo
        </SteelButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          aria-label="Upload photo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </KioskFooter>
    </>
  );
}

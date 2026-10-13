"use client";
/** Speaker grille (rows of perforations). Pulses gently while sounds are requested or the etch is running. */
import { useEffect, useRef, useState } from "react";
import { SOUND_EVENT } from "../lib/sound";

export default function Grille() {
  const [blip, setBlip] = useState(false);
  const [etching, setEtching] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    const onSound = () => {
      setBlip(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBlip(false), 900);
    };
    const onProgress = (e: Event) => {
      const p = (e as CustomEvent<{ progress: number }>).detail.progress;
      setEtching(p >= 0.1 && p <= 0.9);
    };
    window.addEventListener(SOUND_EVENT, onSound);
    window.addEventListener("emboss:progress", onProgress);
    return () => {
      window.removeEventListener(SOUND_EVENT, onSound);
      window.removeEventListener("emboss:progress", onProgress);
      window.clearTimeout(timer.current);
    };
  }, []);

  return <div aria-hidden className="grille" data-pulse={blip || etching} />;
}

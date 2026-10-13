/**
 * Booth audio. Every call is a silent no-op when sound is off or a file is missing.
 * initEmbossSound() listens to the "emboss:progress" event: press at 0, engrave loop while 0.1-0.9, clank at 1.
 */
import { isSoundEnabled } from "@/hooks/SoundContext";
import type { SoundMap } from "@/types";

/** Dispatched whenever a sound is requested; the kiosk grille pulses on it. */
export const SOUND_EVENT = "booth:sound";
export type SoundKey = keyof SoundMap;

let files: SoundMap | null = null;
const dead = new Set<string>();
let loop: HTMLAudioElement | null = null;

export function configureSound(map: SoundMap): void {
  files = map;
}

function make(key: SoundKey): HTMLAudioElement | null {
  const src = files?.[key];
  if (!src || dead.has(src) || typeof Audio === "undefined") return null;
  const a = new Audio(src);
  a.addEventListener("error", () => dead.add(src));
  return a;
}

export function play(key: SoundKey): void {
  if (!isSoundEnabled()) return;
  window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: key }));
  const a = make(key);
  if (!a) return;
  a.volume = 0.8;
  a.play().catch(() => {});
}

function startLoop() {
  if (loop || !isSoundEnabled()) return;
  loop = make("engraveLoop");
  if (!loop) return;
  loop.loop = true;
  loop.volume = 0.5;
  loop.play().catch(() => {});
}

function stopLoop() {
  loop?.pause();
  loop = null;
}

export function initEmbossSound(): () => void {
  let last = -1;
  let started = false;
  const onProgress = (e: Event) => {
    const p = (e as CustomEvent<{ progress: number }>).detail.progress;
    if (p <= 0.0001 && (!started || last > 0.01)) play("press");
    if (p <= 0.0001) started = true;
    const inWindow = p >= 0.1 && p <= 0.9;
    if (inWindow && !loop) startLoop();
    else if (!inWindow || !isSoundEnabled()) stopLoop();
    if (p >= 1 && started) {
      play("clank");
      started = false;
    }
    last = p;
  };
  window.addEventListener("emboss:progress", onProgress);
  return () => {
    window.removeEventListener("emboss:progress", onProgress);
    stopLoop();
  };
}

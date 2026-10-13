"use client";
/**
 * Sound on/off state shared by the navbar toggle, the kiosk and a booth's lib/sound.ts.
 * lib/sound.ts reads it through isSoundEnabled() (no React needed).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

let enabledFlag = true;
export const isSoundEnabled = (): boolean => enabledFlag;

interface SoundCtx {
  enabled: boolean;
  toggle: () => void;
}
const Ctx = createContext<SoundCtx>({ enabled: true, toggle: () => {} });
export const useSound = (): SoundCtx => useContext(Ctx);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem("booth.sound") === "off") setEnabled(false);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    enabledFlag = enabled;
    try {
      localStorage.setItem("booth.sound", enabled ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((e) => !e), []);
  const value = useMemo(() => ({ enabled, toggle }), [enabled, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

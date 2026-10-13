"use client";
/** Live local time as HH:MM:SS. Returns null until mounted (avoids hydration mismatch). */
import { useEffect, useState } from "react";

export function useClock(): string | null {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime([d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":"));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return time;
}

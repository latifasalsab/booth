/** Etched Booth layout: wraps every /etched page in BoothShell (theme, fonts, grain, navbar). */
import type { ReactNode } from "react";
import type { Metadata } from "next";
import BoothShell from "@/components/shared/BoothShell";
import { etchedConfig } from "@/booths/etched/config";
import "@/booths/etched/theme.css";

export const metadata: Metadata = {
  title: "Etched Booth",
  description: "Press your face into silver. Processed on your device.",
};

export default function EtchedLayout({ children }: { children: ReactNode }) {
  return <BoothShell config={etchedConfig}>{children}</BoothShell>;
}

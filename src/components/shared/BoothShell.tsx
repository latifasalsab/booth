/**
 * Wraps one booth: sets data-booth (so the booth's theme.css applies), loads its fonts via
 * fontClassName, and renders grain background + persistent navbar around the page content.
 * Booth-agnostic: everything it shows comes from the BoothConfig and CSS variables.
 */
import type { ReactNode } from "react";
import type { BoothConfig } from "@/types";
import { SoundProvider } from "@/hooks/SoundContext";
import GrainBackground from "./GrainBackground";
import Navbar from "./Navbar";

export default function BoothShell({ config, children }: { config: BoothConfig; children: ReactNode }) {
  return (
    <SoundProvider>
      <div data-booth={config.slug} className={`${config.fontClassName} relative min-h-dvh bg-bg font-ui text-ink`}>
        <GrainBackground opacity={config.grain?.opacity} grid={config.grain?.grid} />
        <Navbar slug={config.slug} name={config.name} nav={config.nav} wordmark={config.wordmark} />
        <div className="relative z-10">{children}</div>
      </div>
    </SoundProvider>
  );
}

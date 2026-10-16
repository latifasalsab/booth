/** Shared types: booth config contract, registry entries, and the global emboss progress value. */
import type { ReactNode } from "react";

export interface NavItem {
  label: string;
  href: string;
}

export interface SoundMap {
  shutter: string;
  countdown: string;
  press: string;
  engraveLoop: string;
  clank: string;
}

export interface GrainSettings {
  /** Overrides the theme's --grain-opacity. */
  opacity?: number;
  /** Background pattern: "grid" (vertical lines, default), "stripes" (diagonal, from the booth's --stripes token) or "none". */
  pattern?: "none" | "grid" | "stripes";
}

/** Everything a booth declares about itself. Filled in booths/<slug>/config.ts. */
export interface BoothConfig {
  slug: string;
  name: string;
  wordmark: ReactNode;
  nav: NavItem[];
  /** Class names from next/font (they define --font-ui, --font-display, --font-dot). */
  fontClassName: string;
  sound: SoundMap;
  grain?: GrainSettings;
}

export type BoothStatus = "live" | "soon";

export interface BoothEntry {
  slug: string;
  name: string;
  tagline: string;
  status: BoothStatus;
  href: string;
}

declare global {
  interface Window {
    /** Single source of truth for the etch animation, 0..1. */
    embossProgress?: number;
  }
}

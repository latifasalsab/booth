/**
 * Etched Booth config: identity, nav, fonts (loaded per booth with next/font) and sound file paths.
 * The fonts define --font-ui (Plus Jakarta Sans), --font-display (Anton) and --font-dot (Doto) on the booth wrapper.
 */
import { createElement } from "react";
import { Anton, DotGothic16, Plus_Jakarta_Sans } from "next/font/google";
import type { BoothConfig } from "@/types";
import Wordmark from "./components/Wordmark";

const ui = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const dot = DotGothic16({ subsets: ["latin"], weight: "400", variable: "--font-dot", display: "swap" });

export const etchedConfig: BoothConfig = {
  slug: "etched",
  name: "Etched Booth",
  wordmark: createElement(Wordmark, { size: "sm" }),
  nav: [
    { label: "Home", href: "/etched" },
    { label: "Themes", href: "/etched/themes" },
    { label: "Policy", href: "/etched/policy" },
    { label: "About", href: "/etched/about" },
  ],
  fontClassName: `${ui.variable} ${display.variable} ${dot.variable}`,
  sound: {
    shutter: "/sounds/shutter.mp3",
    countdown: "/sounds/countdown.mp3",
    press: "/sounds/press.mp3",
    engraveLoop: "/sounds/engrave-loop.mp3",
    clank: "/sounds/clank.mp3",
  },
};

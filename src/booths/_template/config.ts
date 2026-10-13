/**
 * TEMPLATE booth config. Copy this folder to src/booths/<slug>, then edit:
 * slug, name, wordmark, nav, fonts (load with next/font/google here), sound paths.
 */
import type { BoothConfig } from "@/types";

export const templateConfig: BoothConfig = {
  slug: "template",
  name: "Template Booth",
  wordmark: "Template Booth",
  nav: [
    { label: "Home", href: "/template" },
    { label: "Themes", href: "/template/themes" },
    { label: "Policy", href: "/template/policy" },
    { label: "About", href: "/template/about" },
  ],
  // TODO: replace with this booth's next/font class names, e.g. `${ui.variable} ${display.variable}`
  fontClassName: "",
  sound: { shutter: "", countdown: "", press: "", engraveLoop: "", clank: "" },
};

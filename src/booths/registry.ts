/** Every booth the lab knows about. The index page and each booth's Themes page read from here. */
import type { BoothEntry } from "@/types";

export const booths: BoothEntry[] = [
  { slug: "etched", name: "Etched Booth", tagline: "Press your face into silver.", status: "live", href: "/etched" },
  { slug: "fogged", name: "Fogged Booth", tagline: "Draw on a steamed-up mirror.", status: "soon", href: "/fogged" },
  { slug: "bloom", name: "Bloom Booth", tagline: "Grow flowers from your outline.", status: "soon", href: "/bloom" },
  { slug: "scribble", name: "Scribble Booth", tagline: "Your portrait in one wobbly line.", status: "soon", href: "/scribble" },
];

export const getOtherBooths = (slug: string): BoothEntry[] => booths.filter((b) => b.slug !== slug);

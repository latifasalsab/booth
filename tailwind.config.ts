/**
 * Tailwind config. Colors and fonts map to CSS variables, so shared components
 * automatically take on the look of whichever booth wraps them (see each booth's theme.css).
 */
import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        ink: v("ink"),
        muted: v("muted"),
        accent: v("accent"),
        line: v("line"),
      },
      fontFamily: {
        ui: ["var(--font-ui, system-ui)", "ui-sans-serif", "sans-serif"],
        display: ["var(--font-display, Impact)", "Impact", "sans-serif"],
        dot: ["var(--font-dot, ui-monospace)", "ui-monospace", "monospace"],
      },
      borderRadius: { booth: "var(--radius)" },
    },
  },
  plugins: [],
};
export default config;

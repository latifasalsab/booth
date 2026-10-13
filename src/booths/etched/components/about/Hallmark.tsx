/** Small embossed "S" seal built from SVG gradients and layered CSS shadows (raised metal). Presses in 1px on hover. */
export default function Hallmark({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label="Maker's seal: S" className={`hallmark inline-block ${className}`}>
      <svg viewBox="0 0 72 72" width="64" height="64" aria-hidden>
        <defs>
          <radialGradient id="hm-disc" cx="32%" cy="26%" r="85%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".45" stopColor="#c9ccd2" />
            <stop offset="1" stopColor="#7d818a" />
          </radialGradient>
          <linearGradient id="hm-glyph" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6f7f9" />
            <stop offset=".5" stopColor="#9a9ea6" />
            <stop offset="1" stopColor="#d4d6db" />
          </linearGradient>
        </defs>
        <circle cx="36" cy="36" r="33" fill="url(#hm-disc)" />
        <circle cx="36" cy="36" r="27" fill="none" stroke="rgba(0,0,0,.28)" strokeWidth="1.2" />
        <circle cx="36" cy="36" r="28.2" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1" />
        <text x="36" y="48" textAnchor="middle" fontSize="36" fill="url(#hm-glyph)" stroke="rgba(30,32,38,.55)" strokeWidth=".6" style={{ fontFamily: "var(--font-display), Impact, sans-serif" }}>
          S
        </text>
      </svg>
    </span>
  );
}

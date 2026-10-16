/**
 * Fixed film-grain overlay plus an optional pattern ("grid" vertical lines, "stripes" slowly drifting diagonal
 * stripes, or "none"). Booth-agnostic: strength, line color and the stripe artwork come from the booth's CSS
 * variables (--grain-opacity, --grid-line, --stripes, --stripes-mask); props override them.
 */
const svg =
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='.33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 0 1'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#n)'/></svg>";

export const GRAIN_URI = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

interface Props {
  opacity?: number;
  pattern?: "none" | "grid" | "stripes";
}

export default function GrainBackground({ opacity, pattern = "grid" }: Props) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {pattern === "grid" && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgb(var(--line) / var(--grid-line, .06)) 0 1px, transparent 1px 16.6667vw)",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: GRAIN_URI,
          opacity: opacity ?? "var(--grain-opacity, .14)",
          mixBlendMode: "overlay",
        }}
      />
      {pattern === "stripes" && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ maskImage: "var(--stripes-mask, none)", WebkitMaskImage: "var(--stripes-mask, none)" }}
        >
          {/* oversized so the slow transform drift never reveals an edge */}
          <div className="pattern-drift absolute" style={{ inset: "-80px", backgroundImage: "var(--stripes)" }} />
        </div>
      )}
    </div>
  );
}

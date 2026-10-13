/**
 * Fixed film-grain overlay plus faint vertical grid lines. Booth-agnostic:
 * strength and line color come from the booth's CSS variables, props override them.
 */
const svg =
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='.33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 0 1'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#n)'/></svg>";

export const GRAIN_URI = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

interface Props {
  opacity?: number;
  grid?: boolean;
}

export default function GrainBackground({ opacity, grid = true }: Props) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {grid && (
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
    </div>
  );
}

/** Tiny groove-set indicator dot. Lime when on. */
export default function Led({ on = false, label }: { on?: boolean; label?: string }) {
  return <span role="img" aria-label={label} title={label} className={`led ${on ? "led-on" : ""}`} />;
}

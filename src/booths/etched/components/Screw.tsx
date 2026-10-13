/** Decorative slotted screw head. */
export default function Screw({ className = "", angle = 0 }: { className?: string; angle?: number }) {
  return <span aria-hidden className={`screw ${className}`} style={{ rotate: `${angle}deg` }} />;
}

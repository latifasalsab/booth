/**
 * "Etched Booth" wordmark: Anton in glossy embossed silver (gradient clip + layered drop shadows, see theme.css).
 * Used in the navbar (sm), the idle screen and the print.
 */
import type { CSSProperties } from "react";

const SIZES = {
  sm: "text-[20px]",
  md: "text-[clamp(36px,4.4vw,60px)]",
  lg: "text-[clamp(56px,9vw,128px)]",
  inherit: "",
} as const;

interface Props {
  size?: keyof typeof SIZES;
  className?: string;
  style?: CSSProperties;
}

export default function Wordmark({ size = "md", className = "", style }: Props) {
  return (
    <span className={`wordmark ${SIZES[size]} ${className}`} style={style}>
      Etched Booth
    </span>
  );
}

/** Steel keycap button (main action) with a tiny LED, or a flat ghost variant for secondary actions. */
import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "key" | "ghost";
  led?: boolean;
}

export default function SteelButton({ variant = "key", led = false, className = "", children, type = "button", ...rest }: Props) {
  return (
    <button type={type} className={`keycap ${variant === "ghost" ? "keycap-ghost" : ""} ${className}`} {...rest}>
      {variant === "key" && <span aria-hidden className={`led ${led && !rest.disabled ? "led-on" : ""}`} />}
      {children}
    </button>
  );
}

"use client";
/** Link that routes through the gated transition. Prefetches on hover, focus and touchstart. Plain link outside a TransitionProvider. */
import Link from "next/link";
import type { ComponentProps } from "react";
import { useTransitions } from "./TransitionProvider";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export default function TransitionLink({ href, onClick, onMouseEnter, onFocus, onTouchStart, children, ...rest }: Props) {
  const t = useTransitions();
  const warm = () => t?.prefetch(href);
  return (
    <Link
      href={href}
      {...rest}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        warm();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        warm();
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        warm();
      }}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !t) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        if (t.phase !== "idle") return; // ignored while a transition is running
        void t.go(href);
      }}
    >
      {children}
    </Link>
  );
}

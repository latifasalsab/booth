"use client";
/** Link that routes through the page curtain. Falls back to a normal link outside a CurtainProvider. */
import Link from "next/link";
import type { ComponentProps } from "react";
import { useCurtain } from "./PageCurtain";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export default function TransitionLink({ href, onClick, children, ...rest }: Props) {
  const curtain = useCurtain();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !curtain) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        void curtain.go(href);
      }}
    >
      {children}
    </Link>
  );
}

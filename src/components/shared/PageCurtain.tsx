"use client";
/** Route enter animation: new page content fades in and rises 12px (used from a template.tsx). The curtain itself lives in TransitionProvider. */
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

export function PageFade({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
      {children}
    </motion.div>
  );
}

"use client";
/** 1px hairline that draws itself from the left (scaleX 0 -> 1) when it enters the viewport. */
import { motion, useReducedMotion } from "framer-motion";

const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

export default function DrawLine({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={`h-px w-full bg-line/20 ${className}`}
      style={{ transformOrigin: "left center" }}
      initial={{ scaleX: reduced ? 1 : 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: "-5% 0px" }}
      transition={{ duration: reduced ? 0.01 : 0.9, delay: reduced ? 0 : delay, ease: EASE }}
    />
  );
}

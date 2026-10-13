"use client";
/** Fixed 2px accent line at the top of the viewport; scaleX follows page scroll progress. Sits below the navbar. */
import { motion, useScroll } from "framer-motion";

export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-30 h-[2px] w-full bg-accent"
      style={{ scaleX: scrollYProgress, transformOrigin: "left center" }}
    />
  );
}

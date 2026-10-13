"use client";
/**
 * Steel nameplate (kiosk tokens, 4 screws, engraved Doto rows). Rows engrave in one after another when the plate
 * enters the viewport (clip-path wipe, 450ms each, 90ms stagger, text-shadow settles). Hover sweeps a soft metal highlight.
 */
import { motion, useReducedMotion } from "framer-motion";
import { SPEC_ROWS } from "../../content/about";
import Screw from "../Screw";

const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const SHADOW_FROM = "0 3px 1px rgba(255,255,255,0)";
const SHADOW_TO = "0 1px 0 rgba(255,255,255,.55)";

export default function SpecPlate() {
  const reduced = useReducedMotion();
  return (
    <div className="kiosk-screen relative mx-auto w-full max-w-xl px-7 py-9 sm:px-10">
      <Screw className="left-3 top-3" angle={30} />
      <Screw className="right-3 top-3" angle={110} />
      <Screw className="bottom-3 left-3" angle={70} />
      <Screw className="bottom-3 right-3" angle={160} />
      <dl>
        {SPEC_ROWS.map((r, i) => (
          <motion.div
            key={r.label}
            className="spec-row"
            initial={reduced ? false : { clipPath: "inset(0 100% 0 0)", textShadow: SHADOW_FROM }}
            whileInView={{ clipPath: "inset(0 0% 0 0)", textShadow: SHADOW_TO }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.45, delay: i * 0.09, ease: EASE }}
          >
            <dt className="font-dot text-[12px] tracking-[.18em] text-[#4a4d56]">{r.label}</dt>
            <dd className="font-dot text-[16px] tracking-[.06em] text-[#23252b] sm:text-[18px]">{r.value}</dd>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}

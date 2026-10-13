/**
 * /etched/policy: scrollable fine-print page on an engraved panel, with the ambient dots backdrop behind it.
 * The braille art is read on the server from content/dots-art.txt and passed to the (client) backdrop as text.
 */
import fs from "node:fs";
import path from "node:path";
import DrawLine from "@/components/shared/DrawLine";
import Reveal from "@/components/shared/Reveal";
import ScrollProgress from "@/components/shared/ScrollProgress";
import SmoothScroll from "@/components/shared/SmoothScroll";
import DotsBackdrop from "@/booths/etched/components/policy/DotsBackdrop";
import PolicyAccordion from "@/booths/etched/components/policy/PolicyAccordion";
import PolicySummary from "@/booths/etched/components/policy/PolicySummary";
import { LAST_UPDATED, POLICY_LABEL, POLICY_POINTS, POLICY_SECTIONS, POLICY_TITLE } from "@/booths/etched/content/policy";

export default function PolicyPage() {
  const art = fs.readFileSync(path.join(process.cwd(), "src/booths/etched/content/dots-art.txt"), "utf8");
  return (
    <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-28">
      <SmoothScroll />
      <ScrollProgress />
      <DotsBackdrop art={art} />
      <div className="engraved-panel relative max-w-[720px] p-6 sm:p-10">
        <Reveal>
          <p className="font-dot text-[12px] tracking-[.18em] text-muted">{POLICY_LABEL}</p>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className="mt-3 font-display text-[clamp(44px,7vw,84px)] leading-[.95]">{POLICY_TITLE}</h1>
        </Reveal>
        <DrawLine className="my-8" />
        <PolicySummary points={POLICY_POINTS} />
        <DrawLine className="my-8" />
        <PolicyAccordion sections={POLICY_SECTIONS} />
        <Reveal>
          <p className="mt-8 font-dot text-[12px] uppercase tracking-[.14em] text-muted">Last updated · {LAST_UPDATED}</p>
        </Reveal>
      </div>
    </main>
  );
}

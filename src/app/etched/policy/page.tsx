/**
 * /etched/policy: scrollable fine-print page on a steel panel (kiosk tokens, screws, engraved text), over the same
 * page background as the rest of the booth with a toned-down dots backdrop. The braille art is read on the server
 * from content/dots-art.txt and passed to the (client) backdrop as text.
 */
import fs from "node:fs";
import path from "node:path";
import DrawLine from "@/components/shared/DrawLine";
import { PageReady } from "@/components/shared/RouteReady";
import Reveal from "@/components/shared/Reveal";
import ScrollProgress from "@/components/shared/ScrollProgress";
import SmoothScroll from "@/components/shared/SmoothScroll";
import DotsBackdrop from "@/booths/etched/components/policy/DotsBackdrop";
import PolicyAccordion from "@/booths/etched/components/policy/PolicyAccordion";
import PolicySummary from "@/booths/etched/components/policy/PolicySummary";
import Screw from "@/booths/etched/components/Screw";
import { LAST_UPDATED, POLICY_LABEL, POLICY_POINTS, POLICY_SECTIONS, POLICY_TITLE } from "@/booths/etched/content/policy";

export default function PolicyPage() {
  const art = fs.readFileSync(path.join(process.cwd(), "src/booths/etched/content/dots-art.txt"), "utf8");
  return (
    <main className="relative mx-auto max-w-6xl px-5 pb-24 pt-28">
      <PageReady />
      <SmoothScroll />
      <ScrollProgress />
      <DotsBackdrop art={art} intensity={0.6} />
      <div className="kiosk-screen steel-panel relative max-w-[720px] p-6 sm:p-10">
        <Screw className="left-3 top-3" angle={25} />
        <Screw className="right-3 top-3" angle={95} />
        <Screw className="bottom-3 left-3" angle={150} />
        <Screw className="bottom-3 right-3" angle={60} />
        <Reveal>
          <p className="t-label text-muted">{POLICY_LABEL}</p>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className="t-title mt-3">{POLICY_TITLE}</h1>
        </Reveal>
        <DrawLine className="my-8" />
        <PolicySummary points={POLICY_POINTS} />
        <DrawLine className="my-8" />
        <PolicyAccordion sections={POLICY_SECTIONS} />
        <Reveal>
          <p className="t-label mt-8 text-muted">Last updated · {LAST_UPDATED}</p>
        </Reveal>
      </div>
    </main>
  );
}

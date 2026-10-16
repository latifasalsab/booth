/**
 * /etched/about: scrollable page (Lenis smooth scroll + scroll progress). Checks on the server whether
 * public/about/portrait.jpg exists and passes its URL to the hero (null = use the sample face).
 */
import fs from "node:fs";
import path from "node:path";
import { booths } from "@/booths/registry";
import DrawLine from "@/components/shared/DrawLine";
import Reveal from "@/components/shared/Reveal";
import ScrollProgress from "@/components/shared/ScrollProgress";
import SmoothScroll from "@/components/shared/SmoothScroll";
import AboutHero from "@/booths/etched/components/about/AboutHero";
import MakerNote from "@/booths/etched/components/about/MakerNote";
import SpecPlate from "@/booths/etched/components/about/SpecPlate";
import { NEXT_LABEL, PORTRAIT_FILE } from "@/booths/etched/content/about";

export default function AboutPage() {
  const hasPortrait = fs.existsSync(path.join(process.cwd(), "public", PORTRAIT_FILE));
  const upcoming = booths.filter((b) => b.status === "soon");
  return (
    <main className="relative pb-24">
      <SmoothScroll />
      <ScrollProgress />
      <AboutHero portraitSrc={hasPortrait ? `/${PORTRAIT_FILE}` : null} />
      <div className="mx-auto max-w-6xl px-5">
        <DrawLine />
      </div>
      <section className="px-5 py-14">
        <SpecPlate />
      </section>
      <div className="mx-auto max-w-6xl px-5">
        <DrawLine />
      </div>
      <MakerNote />
      <div className="mx-auto max-w-6xl px-5">
        <DrawLine />
      </div>
      <Reveal className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-5 pt-10">
        <span className="t-label mr-1 text-muted">{NEXT_LABEL}</span>
        {upcoming.map((b, i) => (
          <span key={b.slug} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="text-muted">·</span>}
            <span className="chip">{b.name.replace(/ Booth$/, "")}</span>
          </span>
        ))}
      </Reveal>
    </main>
  );
}

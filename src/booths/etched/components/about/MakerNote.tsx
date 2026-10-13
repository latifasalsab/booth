/** Maker note: three sentences, small pill links (placeholder hrefs live in content/about.ts), and the embossed seal. */
import Reveal from "@/components/shared/Reveal";
import { MAKER_LINKS, MAKER_NOTE } from "../../content/about";
import Hallmark from "./Hallmark";

export default function MakerNote() {
  return (
    <section className="relative mx-auto max-w-3xl px-5 py-14">
      <Hallmark className="absolute right-5 top-8" />
      <Reveal>
        <p className="pr-20 text-[clamp(20px,2.4vw,28px)] leading-snug text-ink">{MAKER_NOTE}</p>
      </Reveal>
      <Reveal delay={0.08}>
        <ul className="mt-8 flex flex-wrap gap-2">
          {MAKER_LINKS.map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className="pill"
                {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer noopener" } : {})}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

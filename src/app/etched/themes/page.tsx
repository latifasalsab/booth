/** /etched/themes: dummy recommendations of the other booths in the registry. */
import { getOtherBooths } from "@/booths/registry";
import TransitionLink from "@/components/shared/TransitionLink";

export default function ThemesPage() {
  const others = getOtherBooths("etched");
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-28">
      <h1 className="font-display text-[clamp(48px,9vw,104px)] leading-none">Themes</h1>
      <p className="mt-4 max-w-md text-muted">Other booths in the lab. Each one has its own look.</p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {others.map((b) => {
          const live = b.status === "live";
          const body = (
            <>
              <span className="flex items-center justify-between gap-3">
                <span className="font-display text-3xl leading-none">{b.name}</span>
                <span className="flex items-center gap-1.5 font-dot text-[12px] text-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : "bg-muted/60"}`} />
                  {live ? "Live" : "Soon"}
                </span>
              </span>
              <span className="mt-3 block text-sm text-muted">{b.tagline}</span>
            </>
          );
          const cls = "block rounded-booth border border-line/10 bg-surface p-5";
          return (
            <li key={b.slug}>
              {live ? (
                <TransitionLink href={b.href} className={`${cls} hover:border-line/30`}>
                  {body}
                </TransitionLink>
              ) : (
                <div className={`${cls} opacity-70`} aria-disabled="true">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

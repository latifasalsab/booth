/** Index: a neutral, minimal list of booths from the registry. The real design comes later. */
import { booths } from "@/booths/registry";
import TransitionLink from "@/components/shared/TransitionLink";

function Status({ live }: { live: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : "bg-muted/60"}`} />
      {live ? "Live" : "Soon"}
    </span>
  );
}

export default function IndexPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-20">
      <h1 className="text-sm text-muted">Booth Lab</h1>
      <ul className="mt-8 divide-y divide-line/10 border-y border-line/10">
        {booths.map((b) => {
          const row = (
            <>
              <span>
                <span className="block text-lg">{b.name}</span>
                <span className="block text-sm text-muted">{b.tagline}</span>
              </span>
              <Status live={b.status === "live"} />
            </>
          );
          return (
            <li key={b.slug}>
              {b.status === "live" ? (
                <TransitionLink href={b.href} className="flex items-center justify-between gap-4 py-4 hover:bg-line/[.03]">
                  {row}
                </TransitionLink>
              ) : (
                <div className="flex items-center justify-between gap-4 py-4 opacity-60" aria-disabled="true">
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

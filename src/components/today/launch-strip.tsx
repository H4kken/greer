import { cn } from "@/lib/utils";
import type { LaunchView } from "./types";

// Below this many, the strip stays still: there's nothing to loop through.
const MIN_TO_DRIFT = 4;
// Seconds per card: the strip moves at the same slow pace however many
// launches there are (about 8px a second).
const SECONDS_PER_CARD = 24;

function Card({ l }: { l: LaunchView }) {
  return (
    <li className="w-72 shrink-0">
      <a
        href={l.url}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "flex h-full flex-col gap-1 rounded-2xl border bg-card px-4 py-3 text-foreground no-underline hover:bg-accent",
          l.helped && "border-primary/40",
        )}
      >
        {l.helped && (
          <span className="text-xs font-medium text-primary-soft-foreground">
            {l.author}, someone you know
          </span>
        )}
        <span className="line-clamp-2 font-heading text-[1.0625rem] leading-snug">
          {l.title}
        </span>
        <span className="text-sm text-muted-foreground">
          {l.helped ? l.when : `${l.author} · ${l.when}`}
          <span className="sr-only"> (opens in a new tab)</span>
        </span>
      </a>
    </li>
  );
}

// Recent Show HN posts drifting slowly across the top of Today: other
// people are building too. Something to enjoy, not to triage. Pauses on
// hover or focus; still with reduced motion (then it scrolls by hand).
export function LaunchStrip({ launches }: { launches: LaunchView[] }) {
  if (!launches.length) return null;
  const drift = launches.length >= MIN_TO_DRIFT;
  return (
    <section
      aria-labelledby="launches-heading"
      className="flex flex-col gap-3 border-b bg-muted/60 py-5"
    >
      <div className="mx-auto flex w-full max-w-screen-xl flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4">
        <h2
          id="launches-heading"
          className="font-sans text-xs font-medium tracking-wider text-muted-foreground uppercase"
        >
          Meanwhile, people are building
        </h2>
        <p className="text-sm text-muted-foreground">New on Show HN</p>
      </div>
      <div
        className={cn(
          "group overflow-hidden",
          drift &&
            "[mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)] motion-reduce:overflow-x-auto",
        )}
      >
        <div
          className={cn(
            // Each copy carries its own trailing gap, so -50% loops exactly.
            "flex w-max",
            !drift && "px-4",
            drift &&
              "group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused] motion-safe:animate-drift",
          )}
          style={
            drift
              ? { animationDuration: `${launches.length * SECONDS_PER_CARD}s` }
              : undefined
          }
        >
          <ul aria-label="Recent launches" className="flex gap-3 pr-3">
            {launches.map((l) => (
              <Card key={l.id} l={l} />
            ))}
          </ul>
          {drift && (
            // The loop's second half: hidden from assistive tech and focus.
            <ul
              aria-hidden
              inert
              className="flex gap-3 pr-3 motion-reduce:hidden"
            >
              {launches.map((l) => (
                <Card key={l.id} l={l} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";
import { placePeople } from "@/people/layout";
import type { NetworkPerson } from "./types";

// Today's new people wait at the edge of the network, evenly spread.
const EDGE = 45;

function place(people: NetworkPerson[]) {
  const known = placePeople(people.filter((p) => p.kind !== "new"));
  const newcomers = people.filter((p) => p.kind === "new");
  return [
    ...known,
    ...newcomers.map((p, i) => {
      const angle = ((i / newcomers.length) * 360 + 25) * (Math.PI / 180);
      return {
        ...p,
        x: Number((50 + EDGE * Math.cos(angle)).toFixed(2)),
        y: Number((50 + EDGE * Math.sin(angle)).toFixed(2)),
        size: 16,
      };
    }),
  ];
}

// What fills the space beside the feed when nobody is picked: the people
// you've talked with, gently moving. Who has news glows; the new people you
// could meet today wait at the edge. Decorative: the feed is the way in.
export function PeopleNetwork({
  people,
  summary,
  connected,
}: {
  people: NetworkPerson[];
  summary: string;
  connected: boolean;
}) {
  const placed = place(people);
  const knownCount = people.filter((p) => p.kind !== "new").length;

  return (
    <section
      aria-labelledby="network-heading"
      className="flex flex-col gap-4 rounded-3xl border bg-card p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <h2 id="network-heading" className="text-2xl font-medium">
            Your people
          </h2>
          <p className="text-sm text-muted-foreground">
            {knownCount > 0
              ? `${knownCount} ${knownCount === 1 ? "person" : "people"} you've talked with. Pick someone on the left to see how you could help.`
              : "Pick someone on the left to see how you could help."}
          </p>
        </div>
        {connected ? (
          <Link href="/people" className="text-sm">
            Open the map
          </Link>
        ) : (
          <Link href="/accounts" className="text-sm">
            Connect your Hacker News account
          </Link>
        )}
      </div>

      <div
        role="img"
        aria-label={summary}
        className="relative mx-auto aspect-[6/5] w-full max-w-[44rem]"
      >
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          {placed.map((p) => (
            <line
              key={p.handle}
              x1="50"
              y1="50"
              x2={p.x}
              y2={p.y}
              vectorEffect="non-scaling-stroke"
              strokeWidth={
                p.kind === "new" || p.kind === "waiting"
                  ? 1
                  : p.conversations + 0.5
              }
              strokeDasharray={p.kind === "new" ? "4 4" : undefined}
              className={cn(
                p.kind === "new" || p.kind === "waiting"
                  ? "stroke-border"
                  : p.news
                    ? "stroke-primary/45"
                    : "stroke-primary/25",
              )}
            />
          ))}
        </svg>
        <span aria-hidden className="absolute top-1/2 left-1/2 -translate-1/2">
          <span className="flex size-12 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background motion-safe:animate-breathe">
            You
          </span>
        </span>
        {placed.map((p, i) => (
          <span
            key={p.handle}
            aria-hidden
            className="absolute"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              // Center the dot, not the label, on the point.
              transform: `translate(-${p.size / 2}px, -50%)`,
            }}
          >
            <span
              className="flex items-center gap-2 motion-safe:animate-float"
              style={{
                animationDelay: `-${(i * 0.9) % 7}s`,
                animationDuration: `${6 + (i % 4)}s`,
              }}
            >
              <span
                style={{
                  width: p.size,
                  height: p.size,
                  animationDelay: `${(i * 0.8) % 3}s`,
                }}
                className={cn(
                  "shrink-0 rounded-full",
                  p.kind === "thanked" && "bg-primary",
                  p.kind === "talked" &&
                    "border-2 border-primary bg-primary/30",
                  p.kind === "waiting" &&
                    "border-2 border-muted-foreground bg-card",
                  p.kind === "new" &&
                    "border-2 border-dashed border-primary bg-card",
                  p.news && "motion-safe:animate-halo",
                )}
              />
              {(p.news || p.kind === "new" || p.conversations >= 2) && (
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    p.news && "text-sm font-medium",
                    (p.kind === "new" || p.kind === "waiting") &&
                      "text-muted-foreground",
                  )}
                >
                  {p.handle}
                  {p.kind === "new" && " · new"}
                </span>
              )}
            </span>
          </span>
        ))}
      </div>

      <ul
        aria-label="Legend"
        className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
      >
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary shadow-[0_0_0_3px_var(--color-primary-soft)]" />
          Has news today
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-primary" /> Thanked you
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full border-2 border-primary bg-primary/30" />
          Talked with you
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full border-2 border-dashed border-primary" />
          Could meet today
        </li>
      </ul>
    </section>
  );
}

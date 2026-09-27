import { ScoreBadge } from "@/components/score-badge";

// A static, scaled-down inbox for the welcome page: what the self-hoster is
// setting up. Sample threads, not real data.
const SAMPLE = [
  {
    score: 92,
    met: 4,
    title: "Ask HN: One month, zero paying customers. Keep it or kill it?",
    meta: "Asking for help · 2h ago",
    reason: "Founder with no paying customers yet, asking what to try next.",
  },
  {
    score: 86,
    met: 5,
    title: "Ask HN: How do you get your first users without spamming?",
    meta: "Asking for help · 5h ago",
  },
  {
    score: 78,
    met: 4,
    title: "Show HN: A tiny analytics tool for indie SaaS",
    meta: "Launch · 1d ago",
  },
];

export function InboxPreview() {
  return (
    <figure className="flex flex-col gap-2">
      {/* Decorative: the caption says what it is. */}
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border bg-card"
      >
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="font-heading text-lg">Needs help</span>
          <span className="font-mono text-xs text-muted-foreground">
            3 threads
          </span>
        </div>
        <ul className="divide-y">
          {SAMPLE.map((t, i) => (
            <li
              key={t.title}
              className={
                i === 0
                  ? "flex gap-3 bg-primary-soft/50 px-4 py-3"
                  : "flex gap-3 px-4 py-3"
              }
            >
              <ScoreBadge
                score={t.score}
                criteriaMet={t.met}
                criteriaTotal={5}
                className="h-fit"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-heading leading-snug">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.meta}</span>
                {t.reason && (
                  <span className="text-sm text-muted-foreground">
                    {t.reason}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        What your inbox looks like: each thread scored, with the reason why.
      </figcaption>
    </figure>
  );
}

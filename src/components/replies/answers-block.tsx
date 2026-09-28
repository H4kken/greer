import { ArrowUpRightIcon } from "lucide-react";
import { formatAbsolute, formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { RecentAnswer } from "@/replies/answers";

const TONE_LABEL = {
  question: "asked you something",
  thanks: "thanked you",
  disagreement: "disagreed with you",
  neutral: "answered you",
} as const;

// People who answered the user's replies: the reward for helping. A question
// stands out, since someone is waiting on the user.
export function AnswersBlock({
  answers,
  now,
}: {
  answers: RecentAnswer[];
  now: Date;
}) {
  if (!answers.length) return null;
  return (
    <section aria-labelledby="answers-heading" className="flex flex-col gap-3">
      <h2
        id="answers-heading"
        className="font-sans text-xs font-medium tracking-wider text-muted-foreground uppercase"
      >
        They answered you
      </h2>
      <ul className="flex flex-col gap-2">
        {answers.map((a) => (
          <li
            key={a.id}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border p-4",
              a.tone === "question"
                ? "border-primary/30 bg-primary-soft"
                : "bg-card",
            )}
          >
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{a.author}</span>{" "}
              {TONE_LABEL[a.tone ?? "neutral"]} ·{" "}
              <time
                dateTime={a.postedAt.toISOString()}
                title={formatAbsolute(a.postedAt)}
              >
                {formatRelative(a.postedAt, now)}
              </time>
            </p>
            <blockquote className="line-clamp-3 font-heading text-lg leading-snug italic">
              {a.text}
            </blockquote>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="min-w-0 truncate">On “{a.threadTitle}”</span>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1"
              >
                {a.tone === "question" ? "Answer on HN" : "See it on HN"}
                <ArrowUpRightIcon aria-hidden className="size-3.5" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

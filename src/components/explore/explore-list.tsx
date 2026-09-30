"use client";

import { ArrowUpRightIcon, MessagesSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SeedTag } from "@/components/today/seed-tag";
import type { Seed } from "@/scoring/explain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dismissAction, repliedAction, restoreAction } from "@/today/actions";

export type ExploreRowView = {
  id: string;
  url: string;
  tag: string;
  topic: string;
  topicQuote: boolean;
  context: string | null;
  handle: string;
  when: string;
  whenTitle: string;
  fit: string | null;
  seed: Seed | null;
  launch: boolean;
  activity: string | null;
  replied: boolean;
};

// Every thread that passed the filter, one row each. Open it on HN, say you
// replied (it counts in the day's progress, like on Today) or hide it.
export function ExploreList({ rows }: { rows: ExploreRowView[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [replied, setReplied] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (set: typeof setReplied, id: string, on: boolean) =>
    set((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  function act(row: ExploreRowView, how: "replied" | "hidden") {
    const set = how === "replied" ? setReplied : setHidden;
    toggle(set, row.id, true);
    startTransition(async () => {
      const result =
        how === "replied"
          ? await repliedAction(row.id)
          : await dismissAction(row.id);
      if (!result.ok) {
        toggle(set, row.id, false);
        toast.error(result.error);
        return;
      }
      toast(
        how === "replied"
          ? `Nice. ${row.handle} counts in today's progress.`
          : `Hidden: ${row.topic}`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              toggle(set, row.id, false);
              startTransition(async () => {
                const undo = await restoreAction(row.id);
                if (!undo.ok) toast.error(undo.error);
                router.refresh();
              });
            },
          },
        },
      );
      router.refresh();
    });
  }

  const visible = rows.filter((r) => !hidden.has(r.id));
  return (
    <ul
      aria-label="Threads"
      className="flex flex-col divide-y rounded-2xl border bg-card"
    >
      {visible.map((r) => {
        const done = r.replied || replied.has(r.id);
        return (
          <li
            key={r.id}
            className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0 rounded-full border border-input px-2 py-px font-medium whitespace-nowrap text-foreground">
                  {r.tag}
                </span>
                <span className="min-w-0 truncate">
                  {r.handle} ·{" "}
                  <time title={r.whenTitle} className="font-mono">
                    {r.when}
                  </time>
                </span>
              </span>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                title={r.topicQuote ? `“${r.topic}”` : r.topic}
                className={cn(
                  "inline-flex items-start gap-1 font-heading text-lg leading-snug text-foreground no-underline hover:underline",
                  r.topicQuote && "italic",
                )}
              >
                <span className="line-clamp-2">
                  {r.topicQuote ? `“${r.topic}”` : r.topic}
                </span>
                <ArrowUpRightIcon
                  aria-hidden
                  className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="sr-only"> (opens on Hacker News)</span>
              </a>
              {r.context && (
                <span className="line-clamp-1 text-sm text-muted-foreground">
                  {r.context}
                </span>
              )}
              {(r.fit || r.seed) && (
                <span className="text-sm text-primary-soft-foreground">
                  {r.seed && <SeedTag seed={r.seed} launch={r.launch} />}
                  {r.fit}
                </span>
              )}
              {r.activity && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessagesSquareIcon
                    aria-hidden
                    className="size-3.5 shrink-0"
                  />
                  {r.activity}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {done ? (
                <span className="text-sm text-muted-foreground">
                  You replied
                </span>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => act(r, "replied")}
                    aria-label={`I replied to ${r.handle}`}
                  >
                    I replied
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => act(r, "hidden")}
                    aria-label={`Not for me: ${r.topic.slice(0, 60)}`}
                  >
                    Not for me
                  </Button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

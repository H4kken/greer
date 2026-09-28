"use client";

import { ArrowUpRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lookAgainAction, repliedAction, restoreAction } from "@/today/actions";

type Missing = { id: string; handle: string; title: string; url: string };

// A reply the user marked with "I replied" that Greer still can't find on
// HN. Asked about quietly, so the day's progress stays honest and nobody is
// silently lost: look again, or forget the mark.
export function MissingReplies({ rows }: { rows: Missing[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const visible = rows.filter((r) => !gone.has(r.id));
  if (!visible.length) return null;

  const toggle = (id: string, off: boolean) =>
    setGone((g) => {
      const next = new Set(g);
      if (off) next.add(id);
      else next.delete(id);
      return next;
    });

  function lookAgain() {
    startTransition(async () => {
      const result = await lookAgainAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast("Looking again. This goes away once Greer finds your reply.");
      // A check takes a few seconds; show what it found.
      setTimeout(() => router.refresh(), 20_000);
    });
  }

  function forget(row: Missing) {
    toggle(row.id, true);
    startTransition(async () => {
      const result = await restoreAction(row.id);
      if (!result.ok) {
        toggle(row.id, false);
        toast.error(result.error);
        return;
      }
      toast(`Forgot your reply to ${row.handle}.`, {
        action: {
          label: "Undo",
          onClick: () => {
            toggle(row.id, false);
            startTransition(async () => {
              const undo = await repliedAction(row.id);
              if (!undo.ok) toast.error(undo.error);
              router.refresh();
            });
          },
        },
      });
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Replies Greer didn't find"
      className="flex flex-col gap-2 rounded-2xl border border-dashed px-4 py-3"
    >
      {visible.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm"
        >
          <p className="min-w-0 text-muted-foreground">
            Greer didn&apos;t find your reply to{" "}
            <span className="font-medium text-foreground">{r.handle}</span> on{" "}
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-baseline gap-0.5"
            >
              “{r.title}”
              <ArrowUpRightIcon aria-hidden className="size-3 self-center" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            . Posted from another account, or not posted?
          </p>
          <span className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={lookAgain}
            >
              It&apos;s there, look again
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => forget(r)}
            >
              Forget it
            </Button>
          </span>
        </div>
      ))}
    </section>
  );
}

"use client";

import { ArrowUpRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dismissAction, restoreAction } from "@/today/actions";

type Row = {
  id: string;
  title: string;
  url: string;
  author: string;
  hidden: string | null; // "2d ago"
};

export function HiddenList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [back, setBack] = useState<Set<string>>(new Set());
  const visible = rows.filter((r) => !back.has(r.id));

  function setGone(id: string, gone: boolean) {
    setBack((b) => {
      const next = new Set(b);
      if (gone) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function bringBack(row: Row) {
    setGone(row.id, true);
    startTransition(async () => {
      const result = await restoreAction(row.id);
      if (!result.ok) {
        setGone(row.id, false);
        toast.error(result.error);
        return;
      }
      toast(`Back on Today: ${row.title}`, {
        action: {
          label: "Undo",
          onClick: () => {
            setGone(row.id, false);
            startTransition(async () => {
              const undo = await dismissAction(row.id);
              if (!undo.ok) toast.error(undo.error);
              router.refresh();
            });
          },
        },
      });
      router.refresh();
    });
  }

  if (!visible.length)
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
        <h2 className="text-xl font-medium">Nothing hidden</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          &quot;Not for me&quot; on Today hides a thread; it shows up here.
        </p>
      </div>
    );

  return (
    <ul
      aria-label="Hidden threads"
      className="flex flex-col divide-y rounded-2xl border bg-card"
    >
      {visible.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-start gap-1 font-heading text-lg leading-snug"
            >
              <span className="line-clamp-2">{r.title}</span>
              <ArrowUpRightIcon
                aria-hidden
                className="mt-1 size-3.5 shrink-0"
              />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span className="text-sm text-muted-foreground">
              {r.author}
              {r.hidden && ` · hidden ${r.hidden}`}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => bringBack(r)}
          >
            Bring back
          </Button>
        </li>
      ))}
    </ul>
  );
}

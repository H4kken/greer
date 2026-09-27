"use client";

import {
  ArrowLeftIcon,
  CheckIcon,
  ExternalLinkIcon,
  MinusIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { ScoreBadge } from "@/components/score-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import type { InboxRow, InboxView } from "./types";

type Props = {
  row: InboxRow;
  view: InboxView;
  mentionAdvice: string;
  onDismiss: (reason?: string) => void;
  onSnooze: () => void;
  onRestore: () => void;
  onBack: () => void;
};

export function ThreadPanel({
  row,
  view,
  mentionAdvice,
  onDismiss,
  onSnooze,
  onRestore,
  onBack,
}: Props) {
  const id = useId();
  const [askingWhy, setAskingWhy] = useState(false);
  const [why, setWhy] = useState("");
  const triaged = view === "snoozed" || view === "dismissed";

  return (
    <article
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-6 rounded-lg border p-5"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit lg:hidden"
        onClick={onBack}
      >
        <ArrowLeftIcon aria-hidden /> Back to the list
      </Button>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {row.type === "comment" ? "Comment" : "Post"} · {row.author} ·{" "}
          <time title={row.postedTitle}>{row.postedLabel}</time>
          {row.statusNote && ` · ${row.statusNote}`}
        </p>
        <h2 id={`${id}-title`} className="text-xl font-semibold text-balance">
          {row.type === "comment" && (
            <span className="block text-sm font-normal text-muted-foreground">
              In the thread
            </span>
          )}
          {row.title || "(untitled)"}
        </h2>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants()}
        >
          <ExternalLinkIcon aria-hidden /> Open thread on HN
          <span className="sr-only"> (new tab)</span>
          <Kbd className="bg-primary-foreground/20 text-primary-foreground">
            o
          </Kbd>
        </a>
        {triaged ? (
          <Button type="button" variant="outline" onClick={onRestore}>
            Move back to the inbox <Kbd>u</Kbd>
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onSnooze}>
              Snooze a day <Kbd>s</Kbd>
            </Button>
            <Button type="button" variant="outline" onClick={() => onDismiss()}>
              Dismiss <Kbd>d</Kbd>
            </Button>
          </>
        )}
      </div>

      <section aria-labelledby={`${id}-why`} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 id={`${id}-why`} className="font-medium">
            Why Greer surfaced this
          </h3>
          <ScoreBadge
            score={row.score}
            criteriaMet={row.criteriaMet}
            criteriaTotal={row.criteriaTotal}
          />
        </div>
        <p>{row.reason}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {row.criteria.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              {c.met ? (
                <CheckIcon
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
              ) : (
                <MinusIcon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
              <span className={c.met ? undefined : "text-muted-foreground"}>
                <span className="sr-only">{c.met ? "Yes: " : "No: "}</span>
                {c.label}
              </span>
            </li>
          ))}
        </ul>
        {row.matched.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Found by {row.matched.map((m) => `"${m}"`).join(", ")}
          </p>
        )}
      </section>

      <section aria-labelledby={`${id}-post`} className="flex flex-col gap-2">
        <h3 id={`${id}-post`} className="font-medium">
          {row.type === "comment" ? "The comment" : "The post"}
        </h3>
        {row.text ? (
          <div className="max-h-96 overflow-y-auto rounded-md bg-muted/40 p-3 text-sm whitespace-pre-line">
            {row.text}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No text: the title is the whole post.
          </p>
        )}
      </section>

      <section
        aria-labelledby={`${id}-rules`}
        className="flex flex-col gap-1 text-sm"
      >
        <h3 id={`${id}-rules`} className="font-medium">
          Community rules: Hacker News
        </h3>
        <p className="text-muted-foreground">
          Be kind and substantive; don&apos;t use HN primarily for promotion. If
          you mention something you built, say so.{" "}
          <a
            href="https://news.ycombinator.com/newsguidelines.html"
            target="_blank"
            rel="noreferrer"
          >
            Guidelines
            <span className="sr-only"> (new tab)</span>
          </a>
        </p>
        <p className="text-muted-foreground">{mentionAdvice}</p>
      </section>

      <section
        aria-label="Reply brief"
        className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
      >
        Reply brief and your own reply come next: ideas as short notes, and an
        editor for your words. Greer never writes or posts the reply.
      </section>

      {!triaged && (
        <div className="flex flex-col gap-2">
          {askingWhy ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onDismiss(why);
              }}
            >
              <label htmlFor={`${id}-reason`} className="text-sm font-medium">
                Why isn&apos;t this relevant?
              </label>
              <Textarea
                id={`${id}-reason`}
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g. A news story, not someone with the problem"
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Dismiss
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAskingWhy(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto w-fit px-0"
              onClick={() => setAskingWhy(true)}
            >
              Not relevant? Tell Greer why
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

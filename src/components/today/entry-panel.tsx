"use client";

import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckIcon,
  MinusIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PersonTag } from "./person-tag";
import type { EntryView } from "./types";

const external = { target: "_blank", rel: "noreferrer" } as const;

function NewTab() {
  return (
    <>
      <ArrowUpRightIcon aria-hidden className="size-3.5" />
      <span className="sr-only"> (opens in a new tab)</span>
    </>
  );
}

// The person picked in the feed: for a thread, what they asked and why it
// fits you; for someone you know, what they said and where you talked.
export function EntryPanel({
  entry,
  mentionAdvice,
  onHide,
  onBack,
}: {
  entry: EntryView;
  mentionAdvice: string;
  onHide: (reason?: string) => void;
  onBack: () => void;
}) {
  const id = useId();
  const { thread, answer, launch } = entry;

  return (
    <article
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-6 rounded-3xl border bg-card p-6"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit lg:hidden"
        onClick={onBack}
      >
        <ArrowLeftIcon aria-hidden /> Back to today
      </Button>

      <header className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <PersonTag known={entry.known} />
          <span>
            <span className="font-medium text-foreground">{entry.handle}</span>{" "}
            {entry.event} · <time title={entry.whenTitle}>{entry.when}</time>
          </span>
          {entry.match && (
            <span className="font-medium text-primary-soft-foreground">
              · {entry.match}
            </span>
          )}
        </p>
        <h2
          id={`${id}-title`}
          className={cn(
            "text-3xl leading-tight font-medium tracking-tight text-balance",
            entry.quote && "italic",
          )}
        >
          {entry.quote ? `“${entry.headline}”` : entry.headline}
        </h2>
        {entry.history && (
          <p className="text-sm text-muted-foreground">{entry.history}</p>
        )}
      </header>

      {thread && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <a href={thread.url} {...external} className={buttonVariants()}>
              Open on HN to reply
              <NewTab />
              <Kbd className="bg-primary-foreground/20 text-primary-foreground">
                o
              </Kbd>
            </a>
            <Button type="button" variant="outline" onClick={() => onHide()}>
              Not for me <Kbd>d</Kbd>
            </Button>
          </div>

          <section
            aria-labelledby={`${id}-post`}
            className="flex flex-col gap-2"
          >
            <h3 id={`${id}-post`} className="text-lg font-medium">
              {thread.type === "comment" ? "Their comment" : "Their post"}
            </h3>
            {thread.text ? (
              <div className="max-h-80 overflow-y-auto rounded-xl bg-muted p-4 text-[0.9375rem] leading-relaxed whitespace-pre-line lg:max-h-none lg:overflow-visible">
                {thread.text}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No text: the title is the whole post.
              </p>
            )}
          </section>

          <section
            aria-labelledby={`${id}-why`}
            className="flex flex-col gap-2"
          >
            <h3 id={`${id}-why`} className="text-lg font-medium">
              Why you
            </h3>
            <p>{thread.reason}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {thread.criteria.map((c) => (
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
          </section>

          <section
            aria-label="Ideas for your reply"
            className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
          >
            Ideas for your reply come next: short notes to think with (what they
            need, angles, questions to ask back). You write the reply; Greer
            never does.
          </section>

          <p className="text-sm text-muted-foreground">
            Hacker News asks for kind, substantive replies; if you mention
            something you built, say so. {mentionAdvice}{" "}
            <a
              href="https://news.ycombinator.com/newsguidelines.html"
              {...external}
            >
              Guidelines
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>

          <HideWithReason id={id} onHide={onHide} />
        </>
      )}

      {answer && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            On “{answer.threadTitle}”
          </p>
          <a
            href={answer.url}
            {...external}
            className={cn(
              buttonVariants({ variant: answer.open ? "default" : "outline" }),
              "w-fit",
            )}
          >
            {answer.open ? "Answer on HN" : "See it on HN"}
            <NewTab />
          </a>
        </div>
      )}

      {launch && (
        <div className="flex flex-col gap-2 rounded-xl bg-primary-soft p-4 text-primary-soft-foreground">
          <p className="text-sm font-medium">
            {entry.handle} launched something · {launch.when}
          </p>
          <a
            href={launch.url}
            {...external}
            className="inline-flex w-fit items-start gap-1 font-heading text-lg leading-snug text-primary-soft-foreground"
          >
            {launch.title}
            <NewTab />
          </a>
        </div>
      )}

      {entry.threads.length > 0 && (
        <section
          aria-labelledby={`${id}-where`}
          className="flex flex-col gap-2"
        >
          <h3 id={`${id}-where`} className="font-sans text-sm font-medium">
            Where you talked
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {entry.threads.map((t) => (
              <li key={t.url}>
                <a
                  href={t.url}
                  {...external}
                  className="inline-flex items-start gap-1"
                >
                  <span className="line-clamp-2">
                    {t.title || "(untitled thread)"}
                  </span>
                  <NewTab />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function HideWithReason({
  id,
  onHide,
}: {
  id: string;
  onHide: (reason?: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  if (!asking)
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto w-fit px-0"
        onClick={() => setAsking(true)}
      >
        Not relevant? Tell Greer why
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onHide(why);
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
          Hide it
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setAsking(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

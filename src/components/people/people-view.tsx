"use client";

import { ArrowUpRightIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setTriedProductAction } from "@/people/actions";
import type { PersonKind, TopicStage } from "@/people/build";
import { placePeople } from "@/people/layout";
import { useOrbit } from "@/components/use-orbit";

// A person, ready to render: dates already turned into text on the server.
export type PersonView = {
  handle: string;
  kind: PersonKind;
  conversations: number;
  summary: string; // "3 conversations · since Aug 14"
  latest: { text: string; label: string; url: string } | null;
  openQuestion: { text: string; url: string } | null;
  threads: { title: string; url: string }[];
  topicIds: string[];
  topics: string[]; // their names, lowercased for a sentence
  tried: boolean;
};

export type TopicView = {
  id: string;
  name: string;
  stage: TopicStage;
  evidence: string; // "You helped 5 people · 3 thanked you"
};

const STAGE: Record<
  TopicStage,
  { label: string; level: number; note: string }
> = {
  planted: {
    label: "Just planted",
    level: 1,
    note: "You replied. Answers come later, or not at all: that's normal on HN.",
  },
  growing: {
    label: "Growing",
    level: 2,
    note: "Someone answered you. Keeping the conversation going helps it grow.",
  },
  rooted: {
    label: "Rooted",
    level: 3,
    note: "People trust you on this. A good topic to post about someday.",
  },
};

// A plant for each stage: grows only from what people do back.
function Plant({
  stage,
  className,
}: {
  stage: TopicStage;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 56 64"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      className={cn("shrink-0 stroke-primary", className)}
    >
      <path d="M14 60h28" className="stroke-muted-foreground" />
      {stage === "planted" && (
        <>
          <path d="M28 60V46" />
          <path d="M28 50c-6 0-9-3-9-8 5 0 9 2 9 8Z" className="fill-card" />
        </>
      )}
      {stage === "growing" && (
        <>
          <path d="M28 60V30" />
          <path
            d="M28 46c-9 0-14-5-14-12 7 0 14 3 14 12Z"
            className="fill-primary/40"
          />
          <path
            d="M28 38c9 0 14-5 14-12-7 0-14 3-14 12Z"
            className="fill-primary/40"
          />
        </>
      )}
      {stage === "rooted" && (
        <>
          <path d="M28 60V20" />
          <path
            d="M28 44c-10 0-16-6-16-14 8 0 16 4 16 14Z"
            className="fill-primary/40"
          />
          <path
            d="M28 34c10 0 16-6 16-14-8 0-16 4-16 14Z"
            className="fill-primary/40"
          />
          <path
            d="M28 22c-6 0-10-5-10-12 6 0 10 4 10 12Z"
            className="fill-primary"
          />
          <path
            d="M28 22c6 0 10-5 10-12-6 0-10 4-10 12Z"
            className="fill-primary"
          />
        </>
      )}
    </svg>
  );
}

export type PathCounts = {
  helped: number;
  answered: number;
  cameBack: number;
  tried: number;
};

const KIND_LABEL: Record<PersonKind, string> = {
  thanked: "thanked you",
  talked: "talked with you",
  waiting: "no answer yet",
};

const external = { target: "_blank", rel: "noreferrer" } as const;

// One turn around you, in seconds: as slow as Today's network.
const TURN_S = 150;

function NewTab() {
  return (
    <>
      <ArrowUpRightIcon aria-hidden className="size-3.5" />
      <span className="sr-only"> (opens in a new tab)</span>
    </>
  );
}

function Dot({
  kind,
  size,
  tried,
}: {
  kind: PersonKind;
  size: number;
  tried: boolean;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "shrink-0 rounded-full",
        kind === "thanked" && "bg-primary",
        kind === "talked" && "border-2 border-primary bg-primary/30",
        kind === "waiting" && "border-2 border-muted-foreground bg-card",
        tried &&
          "shadow-[0_0_0_3px_var(--color-card),0_0_0_5px_var(--color-tried)]",
      )}
    />
  );
}

export function PeopleView({
  people: initial,
  topics,
  path: initialPath,
  productName,
}: {
  people: PersonView[];
  topics: TopicView[];
  path: PathCounts;
  productName: string;
}) {
  const [people, setPeople] = useState(initial);
  const [selected, setSelected] = useState(initial[0]?.handle ?? null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const topic = topics.find((t) => t.id === topicId) ?? null;
  const inTopic = (p: PersonView) => !topic || p.topicIds.includes(topic.id);
  const person = people.find((p) => p.handle === selected) ?? people[0]!;
  const placed = placePeople(people);
  // The map turns slowly, like Today's; it holds still under the pointer so
  // a dot is easy to pick.
  const orbitBox = useOrbit(
    placed.map((p) => ({ ...p, turn: TURN_S })),
    { pauseOnHover: true },
  );
  const path = {
    ...initialPath,
    tried: people.filter((p) => p.tried).length,
  };

  function setTried(handle: string, tried: boolean) {
    const update = (value: boolean) =>
      setPeople((all) =>
        all.map((p) => (p.handle === handle ? { ...p, tried: value } : p)),
      );
    update(tried); // optimistic
    startTransition(async () => {
      const result = await setTriedProductAction(handle, tried);
      if (!result.ok) {
        update(!tried);
        toast.error(result.error);
      }
    });
  }

  const select = (handle: string) => setSelected(handle);
  // Picking a topic also picks someone in it, so the panel matches the map.
  function pickTopic(id: string | null) {
    setTopicId(id);
    const first = people.find((p) => !id || p.topicIds.includes(id));
    if (first && id && !person.topicIds.includes(id)) setSelected(first.handle);
  }

  return (
    <div className="flex flex-col gap-6">
      {topics.length > 0 && (
        <section
          aria-labelledby="topics-heading"
          className="flex flex-col gap-3"
        >
          <h2
            id="topics-heading"
            className="font-sans text-xs font-medium tracking-wider text-muted-foreground uppercase"
          >
            What you help people with
          </h2>
          <ul className="flex flex-wrap gap-2">
            {[{ id: null, name: "Everyone", stage: null }, ...topics].map(
              (t) => {
                const on = topicId === t.id;
                return (
                  <li key={t.id ?? "all"}>
                    <button
                      type="button"
                      onClick={() => pickTopic(t.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm",
                        on
                          ? "border-primary bg-primary-soft font-medium text-primary-soft-foreground"
                          : "bg-card hover:bg-accent",
                      )}
                    >
                      {t.name}
                      {t.stage && (
                        <>
                          <span aria-hidden className="flex gap-0.5">
                            {[1, 2, 3].map((l) => (
                              <span
                                key={l}
                                className={cn(
                                  "size-1.5 rounded-full",
                                  l <= STAGE[t.stage].level
                                    ? "bg-primary"
                                    : "bg-border",
                                )}
                              />
                            ))}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {STAGE[t.stage].label}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                );
              },
            )}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Everyone you've talked with" className="min-w-0">
          {/* The map needs room; phones get a list instead. */}
          <div className="hidden md:block">
            <div
              ref={orbitBox}
              className="relative mx-auto aspect-square w-full max-w-[44rem] overflow-hidden rounded-3xl border bg-card"
            >
              <svg
                aria-hidden
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full"
              >
                {placed.map((p, i) => (
                  <line
                    key={p.handle}
                    data-orbit-line={i}
                    x1="50"
                    y1="50"
                    x2={p.x}
                    y2={p.y}
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={
                      p.kind === "waiting" ? 1 : p.conversations + 0.5
                    }
                    className={cn(
                      "transition-opacity",
                      p.kind === "waiting"
                        ? "stroke-border"
                        : "stroke-primary/25",
                      !inTopic(p) && "opacity-20",
                    )}
                  />
                ))}
              </svg>
              <span
                aria-hidden
                className="absolute top-1/2 left-1/2 flex size-12 -translate-1/2 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background"
              >
                You
              </span>
              <ul>
                {placed.map((p, i) => (
                  <li
                    key={p.handle}
                    data-orbit-dot={i}
                    className={cn(
                      "absolute transition-opacity will-change-transform",
                      !inTopic(p) && "opacity-20",
                    )}
                    style={{
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      // Center the dot, not the whole button, on the point.
                      transform: `translate(-${p.size / 2}px, -50%)`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => select(p.handle)}
                      aria-pressed={p.handle === person.handle}
                      aria-label={`${p.handle}, ${p.summary}, ${KIND_LABEL[p.kind]}${p.tried ? `, tried ${productName}` : ""}`}
                      className={cn(
                        "flex items-center gap-2 rounded-full pr-2 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring",
                        p.handle === person.handle &&
                          "outline-2 outline-foreground",
                      )}
                    >
                      <Dot kind={p.kind} size={p.size} tried={p.tried} />
                      <span
                        className={cn(
                          "whitespace-nowrap",
                          p.conversations >= 2 ? "text-sm" : "text-xs",
                          p.kind === "waiting" && "text-muted-foreground",
                          p.handle === person.handle && "font-semibold",
                        )}
                      >
                        {p.handle}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {people.length > placed.length && (
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Showing the {placed.length} people you talked with most.
              </p>
            )}
            <ul
              aria-label="Legend"
              className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
            >
              <li className="flex items-center gap-2">
                <Dot kind="thanked" size={12} tried={false} /> Thanked you
              </li>
              <li className="flex items-center gap-2">
                <Dot kind="talked" size={12} tried={false} /> Talked with you
              </li>
              <li className="flex items-center gap-2">
                <Dot kind="waiting" size={12} tried={false} /> No answer yet
              </li>
              <li className="flex items-center gap-2">
                <Dot kind="thanked" size={12} tried /> Tried {productName}
              </li>
            </ul>
          </div>

          <ul className="flex flex-col divide-y rounded-2xl border bg-card md:hidden">
            {people.filter(inTopic).map((p) => (
              <li key={p.handle}>
                <button
                  type="button"
                  onClick={() => select(p.handle)}
                  aria-pressed={p.handle === person.handle}
                  className={cn(
                    "flex w-full items-center gap-3 p-3 text-left",
                    p.handle === person.handle && "bg-primary-soft",
                  )}
                >
                  <Dot kind={p.kind} size={16} tried={p.tried} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{p.handle}</span>
                    <span className="text-sm text-muted-foreground">
                      {p.summary}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex flex-col gap-4">
          {topic && (
            <section
              aria-labelledby="topic-heading"
              className="flex gap-4 rounded-2xl border bg-card p-5"
            >
              <Plant stage={topic.stage} className="h-14 w-12" />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h2 id="topic-heading" className="text-xl font-medium">
                    {topic.name}
                  </h2>
                  <span className="text-sm font-medium text-primary-soft-foreground">
                    {STAGE[topic.stage].label}
                  </span>
                </div>
                <p className="text-sm">{topic.evidence}</p>
                <p className="text-sm text-muted-foreground">
                  {STAGE[topic.stage].note}
                </p>
              </div>
            </section>
          )}
          <section
            aria-live="polite"
            aria-labelledby="person-heading"
            className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
          >
            <div className="flex flex-col gap-1">
              <h2 id="person-heading" className="text-2xl font-medium">
                {person.handle}
              </h2>
              <p className="text-sm text-muted-foreground">{person.summary}</p>
              {person.topics.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  You helped with {person.topics.join(", ")}
                </p>
              )}
            </div>

            {person.openQuestion ? (
              <div className="flex flex-col gap-3 rounded-xl bg-primary-soft p-4 text-primary-soft-foreground">
                <p className="text-sm font-medium">Asked you something</p>
                <blockquote className="line-clamp-4 font-heading text-lg leading-snug italic">
                  {person.openQuestion.text}
                </blockquote>
                <a
                  href={person.openQuestion.url}
                  {...external}
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "w-fit gap-1 no-underline",
                  )}
                >
                  Answer on HN
                  <NewTab />
                </a>
              </div>
            ) : person.latest ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Their latest words · {person.latest.label}
                </p>
                <blockquote className="line-clamp-4 font-heading text-lg leading-snug italic">
                  {person.latest.text}
                </blockquote>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No answer yet. That&apos;s common on Hacker News, and fine.
              </p>
            )}

            {person.threads.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="font-sans text-sm font-medium">
                  Where you talked
                </h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {person.threads.map((t) => (
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
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm">
              {person.tried ? (
                <>
                  <span className="font-medium text-tried-foreground">
                    Tried {productName} · you marked this
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setTried(person.handle, false)}
                  >
                    Undo
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">
                    Only you know this one.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setTried(person.handle, true)}
                  >
                    They tried {productName}
                  </Button>
                </>
              )}
            </div>

            <a
              href={`https://news.ycombinator.com/user?id=${encodeURIComponent(person.handle)}`}
              {...external}
              className="inline-flex w-fit items-center gap-1 text-sm"
            >
              {person.handle}&apos;s profile on HN
              <NewTab />
            </a>
          </section>

          <PathCard path={path} productName={productName} />
        </aside>
      </div>
    </div>
  );
}

function PathCard({
  path,
  productName,
}: {
  path: PathCounts;
  productName: string;
}) {
  const steps = [
    { label: "Talked with", n: path.helped },
    { label: "Answered you", n: path.answered },
    { label: "Came back", n: path.cameBack },
    { label: `Tried ${productName}`, n: path.tried, tried: true },
  ];
  return (
    <section
      aria-labelledby="path-heading"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="path-heading" className="text-lg font-medium">
          The long game
        </h2>
        <p className="text-sm text-muted-foreground">
          Trust builds slowly. Greer sees the first steps; you tell it the last
          one.
        </p>
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        {steps.map((s) => (
          <div
            key={s.label}
            className="grid grid-cols-[8.5rem_minmax(0,1fr)_2rem] items-center gap-2"
          >
            <dt className="truncate">{s.label}</dt>
            <dd
              aria-hidden
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn(
                  "block h-full rounded-full",
                  s.tried ? "bg-tried" : "bg-primary",
                )}
                // At least a sliver for 1 of many; nothing for 0.
                style={{
                  width: `${s.n && path.helped ? Math.max(3, (s.n / path.helped) * 100) : 0}%`,
                }}
              />
            </dd>
            <dd className="text-right font-mono">{s.n}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

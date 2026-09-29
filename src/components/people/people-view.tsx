"use client";

import { ArrowUpRightIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { toast } from "sonner";
import { useOrbit } from "@/components/use-orbit";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { setTriedProductAction } from "@/people/actions";
import type { PersonKind, TopicStage } from "@/people/build";
import { placePeople } from "@/people/layout";

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

export type PathCounts = {
  helped: number;
  answered: number;
  cameBack: number;
  tried: number;
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

const KIND_LABEL: Record<PersonKind, string> = {
  thanked: "thanked you",
  talked: "talked with you",
  waiting: "no answer yet",
};

const external = { target: "_blank", rel: "noreferrer" } as const;

// One turn around you, in seconds: as slow as Today's network.
const TURN_S = 150;

// The map needs room: below this, phones get a list and a sheet.
const WIDE = "(min-width: 48rem)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const isWide = () => window.matchMedia(WIDE).matches;

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
  asks = false,
}: {
  kind: PersonKind;
  size: number;
  tried: boolean;
  // Asked you something you haven't answered: a soft halo.
  asks?: boolean;
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
          "shadow-[0_0_0_3px_var(--color-background),0_0_0_5px_var(--color-tried)]",
        asks && !tried && "shadow-[0_0_0_6px_var(--color-primary-soft)]",
      )}
    />
  );
}

// The page is the map: everyone you've talked with around you, and the
// rest (topics, who waits on you, the long game, the person you pick) floats
// on it. Phones get a list and a bottom sheet instead.
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
  // Nobody is picked at first: the map is the page.
  const [selected, setSelected] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const topic = topics.find((t) => t.id === topicId) ?? null;
  const inTopic = (p: PersonView) => !topic || p.topicIds.includes(topic.id);
  const person = people.find((p) => p.handle === selected) ?? null;
  const waiting = people.filter((p) => p.openQuestion);
  const placed = placePeople(people);
  const orbitBox = useOrbit(placed.map((p) => ({ ...p, turn: TURN_S })));
  const path = {
    ...initialPath,
    tried: people.filter((p) => p.tried).length,
  };

  // Escape puts the picked person away (the phone sheet handles its own).
  useEffect(() => {
    if (!person || !wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [person, wide]);

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

  const select = (handle: string) =>
    setSelected((s) => (s === handle ? null : handle));

  const heading = (
    <div className="flex flex-col gap-1">
      <h1 className="text-3xl font-medium tracking-tight">Your people</h1>
      <p className="text-sm text-muted-foreground">
        {people.length} {people.length === 1 ? "person" : "people"} you&apos;ve
        talked with on Hacker News. The more you&apos;ve talked, the closer they
        are.
      </p>
    </div>
  );

  const topicChips = topics.length > 0 && (
    <ul aria-label="What you help people with" className="flex flex-wrap gap-2">
      {[{ id: null, name: "Everyone", stage: null }, ...topics].map((t) => {
        const on = topicId === t.id;
        return (
          <li key={t.id ?? "all"} className="shrink-0">
            <button
              type="button"
              onClick={() => setTopicId(t.id)}
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
                  <span
                    className={cn(
                      "text-xs font-normal",
                      on
                        ? "text-primary-soft-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {STAGE[t.stage].label}
                  </span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const topicLine = topic && (
    <p aria-live="polite" className="text-sm">
      {topic.evidence}.{" "}
      <span className="text-muted-foreground">{STAGE[topic.stage].note}</span>
    </p>
  );

  const first = waiting[0];
  const waitingCard = (className: string) =>
    first && (
      <button
        type="button"
        onClick={() => setSelected(first.handle)}
        className={cn(
          "flex flex-col gap-1 rounded-2xl bg-primary-soft px-4 py-3 text-left text-primary-soft-foreground hover:bg-primary-soft/80",
          className,
        )}
      >
        <span className="text-xs font-medium tracking-wider uppercase">
          Waiting on you · {waiting.length}
        </span>
        <span className="text-sm">
          <span className="font-medium">{first.handle}</span> asked you
          something
        </span>
        <span className="line-clamp-3 font-heading text-base leading-snug italic">
          “{first.openQuestion!.text}”
        </span>
      </button>
    );

  const details = person && (
    <PersonDetails
      person={person}
      productName={productName}
      pending={pending}
      onTried={(tried) => setTried(person.handle, tried)}
    />
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Wide screens: the map fills the page; the rest floats on it. */}
      <section
        aria-label="Everyone you've talked with"
        className="relative hidden min-h-[40rem] flex-1 overflow-hidden md:block"
      >
        <div
          ref={orbitBox}
          // Leaves room for the title above and the cards below. The picked
          // person's card slides over the map, which stays as it is.
          className="absolute inset-x-0 top-24 bottom-16"
        >
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
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
                strokeWidth={p.kind === "waiting" ? 1 : p.conversations + 0.5}
                className={cn(
                  "transition-opacity",
                  p.kind === "waiting"
                    ? "stroke-border"
                    : p.handle === person?.handle
                      ? "stroke-primary"
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
            {placed.map((p, i) => {
              const picked = p.handle === person?.handle;
              return (
                <li
                  key={p.handle}
                  data-orbit-dot={i}
                  className={cn(
                    "absolute transition-opacity will-change-transform",
                    !inTopic(p) && "opacity-25",
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
                    aria-pressed={picked}
                    aria-label={`${p.handle}, ${p.summary}, ${KIND_LABEL[p.kind]}${p.openQuestion ? ", asked you something" : ""}${p.tried ? `, tried ${productName}` : ""}`}
                    className={cn(
                      "flex items-center gap-2 rounded-full pr-2 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring",
                      picked && "outline-2 outline-foreground",
                    )}
                  >
                    <Dot
                      kind={p.kind}
                      size={p.size}
                      tried={p.tried}
                      asks={!!p.openQuestion}
                    />
                    <span className="flex flex-col items-start">
                      <span
                        className={cn(
                          "whitespace-nowrap",
                          p.conversations >= 2 ? "text-sm" : "text-xs",
                          p.kind === "waiting" && "text-muted-foreground",
                          (picked || p.openQuestion) && "font-medium",
                        )}
                      >
                        {p.handle}
                      </span>
                      {p.openQuestion && (
                        <span className="text-xs whitespace-nowrap text-primary-soft-foreground">
                          asked you something
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Floating on the map; the gaps between them stay the map's. */}
        <div className="pointer-events-none absolute inset-0 p-6">
          <div className="pointer-events-auto flex w-fit max-w-3xl flex-col gap-3">
            {heading}
            {topicChips}
            {topicLine}
          </div>
          {!person &&
            waitingCard("pointer-events-auto absolute top-6 right-6 w-80")}
          <div className="pointer-events-auto absolute bottom-6 left-6 flex flex-wrap items-end gap-4">
            <PathCard path={path} productName={productName} />
            <div className="flex flex-col gap-1 rounded-2xl bg-background/90 px-3 py-2">
              <Legend productName={productName} />
              {people.length > placed.length && (
                <p className="text-xs text-muted-foreground">
                  Showing the {placed.length} people you talked with most.
                </p>
              )}
            </div>
          </div>
        </div>

        {person && wide && (
          <section
            aria-labelledby="person-heading"
            className="absolute inset-y-4 right-4 flex w-[calc(100%-2rem)] max-w-[25rem] animate-in flex-col overflow-y-auto overscroll-contain rounded-3xl border bg-card p-6 duration-300 fade-in-0 slide-in-from-right-8 motion-reduce:animate-none"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="absolute top-4 right-4"
              onClick={() => setSelected(null)}
            >
              <XIcon />
            </Button>
            {details}
          </section>
        )}
      </section>

      {/* Phones: a list; picking someone opens a sheet. */}
      <div className="flex flex-col gap-4 px-4 py-6 md:hidden">
        {heading}
        {topicChips}
        {topicLine}
        {waitingCard("")}
        <ul
          aria-label="Everyone you've talked with"
          className="flex flex-col divide-y rounded-2xl border bg-card"
        >
          {people.filter(inTopic).map((p) => (
            <li key={p.handle}>
              <button
                type="button"
                onClick={() => setSelected(p.handle)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left"
              >
                <Dot
                  kind={p.kind}
                  size={16}
                  tried={p.tried}
                  asks={!!p.openQuestion}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{p.handle}</span>
                  <span className="text-sm text-muted-foreground">
                    {p.openQuestion ? "Asked you something" : p.summary}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <PathCard path={path} productName={productName} />
        <Legend productName={productName} />
      </div>
      <Sheet
        open={!!person && !wide}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-3xl p-5 pt-6"
        >
          {person && (
            <>
              <SheetTitle className="sr-only">{person.handle}</SheetTitle>
              <SheetDescription className="sr-only">
                {person.summary}
              </SheetDescription>
            </>
          )}
          {!wide && details}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Everything about one person: what waits for you, where you talked, and
// the one thing only you know (they tried your product).
function PersonDetails({
  person,
  productName,
  pending,
  onTried,
}: {
  person: PersonView;
  productName: string;
  pending: boolean;
  onTried: (tried: boolean) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1 pr-10">
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
        <div className="flex flex-col gap-3 rounded-2xl bg-primary-soft p-4 text-primary-soft-foreground">
          <p className="text-sm font-medium">Asked you something</p>
          <blockquote className="line-clamp-6 font-heading text-lg leading-snug italic">
            {person.openQuestion.text}
          </blockquote>
          <a
            href={person.openQuestion.url}
            {...external}
            className={cn(buttonVariants(), "w-fit gap-1 no-underline")}
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
          <blockquote className="line-clamp-6 font-heading text-lg leading-snug italic">
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
          <h3 className="font-sans text-xs font-medium tracking-wider text-muted-foreground uppercase">
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

      <div className="mt-auto flex flex-col gap-3">
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
                onClick={() => onTried(false)}
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
                onClick={() => onTried(true)}
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
      </div>
    </div>
  );
}

function Legend({ productName }: { productName: string }) {
  return (
    <ul
      aria-label="Legend"
      className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"
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
      className="flex w-full flex-col gap-3 rounded-2xl border bg-card p-4 md:w-72"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="path-heading" className="text-lg font-medium">
          The long game
        </h2>
        <p className="text-xs text-muted-foreground">
          Trust builds slowly. Greer sees the first steps; you tell it the last
          one.
        </p>
      </div>
      <dl className="flex flex-col gap-1.5 text-sm">
        {steps.map((s) => (
          <div
            key={s.label}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)_1.75rem] items-center gap-2"
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { dismissAction, repliedAction, restoreAction } from "@/today/actions";
import { cn } from "@/lib/utils";
import { EntryPanel } from "./entry-panel";
import { PersonTag } from "./person-tag";
import type { EntryView } from "./types";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

// The last card taken off Today, and its threads, for undo.
type SetAside = { entry: EntryView; ids: string[] };

// The card's last line: how you know someone, else why they fit. "You
// replied once, no answer yet" would only repeat the tag.
const foot = (e: EntryView) => (e.known && !e.waiting ? e.history : e.fit);

// Where "o" and the card's main button go.
const linkOf = (e: EntryView) =>
  e.thread?.url ?? e.answer?.url ?? e.launch?.url ?? null;

export function TodayView({
  entries,
  more,
  pace,
  initialKey,
  mentionAdvice,
  empty,
  aside,
}: {
  entries: EntryView[];
  more: EntryView[];
  pace: number;
  initialKey: string | null;
  mentionAdvice: string;
  // Shown when there's nobody today.
  empty: React.ReactNode;
  // Beside the feed while nobody is picked: the people network.
  aside: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showMore, setShowMore] = useState(
    !!initialKey && more.some((e) => e.key === initialKey),
  );
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const lastSetAside = useRef<SetAside | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  const visible = useMemo(
    () =>
      [...entries, ...(showMore ? more : [])].filter((e) => !hidden.has(e.key)),
    [entries, more, showMore, hidden],
  );
  const selected = visible.find((e) => e.key === selectedKey) ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  // A newly picked person starts at the top of the panel.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [selected?.key]);

  // On wide screens the panel ends inside the window and scrolls within:
  // it gets the room left below its top, which grows as the page scrolls
  // until it sticks. CSS can't know that room, so it's measured.
  const picked = !!selected;
  useEffect(() => {
    const el = panelRef.current;
    if (!el || !picked) return;
    const wide = window.matchMedia("(min-width: 64rem)");
    const GAP = 16;
    let frame = 0;
    const fit = () => {
      frame = 0;
      el.style.maxHeight = wide.matches
        ? `${window.innerHeight - Math.max(el.getBoundingClientRect().top, GAP) - GAP}px`
        : "";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    wide.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      wide.removeEventListener("change", schedule);
      el.style.maxHeight = "";
    };
  }, [picked]);
  const extra = showMore ? more.filter((e) => !hidden.has(e.key)) : [];

  // ?p= keeps the picked person across reloads and shared links.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("p", selected.key);
    else url.searchParams.delete("p");
    // Keeps Next's own history state: a plain replaceState makes the router
    // restore the page as saved in history, undoing any router.refresh()
    // since (a card just set aside would come back, the network go stale).
    window.history.replaceState(window.history.state, "", url);
  }, [selected]);

  const select = useCallback((key: string | null, focus: boolean) => {
    setSelectedKey(key);
    if (focus && key) {
      const el = cardRefs.current.get(key);
      el?.focus();
      el?.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (!visible.length) return;
      const index = selected ? visible.indexOf(selected) : -1;
      const next =
        visible[
          index < 0 && delta < 0
            ? 0
            : Math.min(visible.length - 1, Math.max(0, index + delta))
        ];
      if (next) select(next.key, true);
    },
    [visible, selected, select],
  );

  // Takes back "not for me" or "I replied": the threads become new again.
  const undo = useCallback(
    ({ entry, ids }: SetAside) => {
      setHidden((h) => {
        const next = new Set(h);
        next.delete(entry.key);
        return next;
      });
      setSelectedKey(entry.key);
      startTransition(async () => {
        const results = await Promise.all(ids.map((id) => restoreAction(id)));
        const failed = results.find((r) => !r.ok);
        if (failed && !failed.ok) toast.error(failed.error);
        router.refresh();
      });
    },
    [router],
  );

  // Takes a card off Today: "not for me" hides all of the person's threads
  // here; "I replied" marks the one they answered, so the day's progress
  // counts it right away.
  const setAside = useCallback(
    (entry: EntryView, how: "hidden" | "replied", reason?: string) => {
      if (!entry.thread) return;
      const ids =
        how === "hidden"
          ? [entry.thread.id, ...entry.also.map((t) => t.id)]
          : [entry.thread.id];
      const index = visible.indexOf(entry);
      const next = visible[index + 1] ?? visible[index - 1] ?? null;
      setHidden((h) => new Set(h).add(entry.key));
      if (selectedKey === entry.key) {
        setSelectedKey(next?.key ?? null);
        if (next) requestAnimationFrame(() => select(next.key, true));
      }
      const done = { entry, ids };
      lastSetAside.current = done;
      startTransition(async () => {
        const results = await Promise.all(
          ids.map((id) =>
            how === "hidden" ? dismissAction(id, reason) : repliedAction(id),
          ),
        );
        const failed = results.find((r) => !r.ok);
        if (failed && !failed.ok) {
          setHidden((h) => {
            const n = new Set(h);
            n.delete(entry.key);
            return n;
          });
          toast.error(failed.error);
          return;
        }
        toast(
          how === "hidden"
            ? `Hidden: ${entry.thread!.title}`
            : `Nice. ${entry.handle} counts in today's progress.`,
          { action: { label: "Undo", onClick: () => undo(done) } },
        );
        router.refresh();
      });
    },
    [visible, selectedKey, select, router, undo],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      switch (e.key) {
        case "j":
        case "ArrowDown":
          move(1);
          break;
        case "k":
        case "ArrowUp":
          move(-1);
          break;
        case "o": {
          const url = selected && linkOf(selected);
          if (url) window.open(url, "_blank", "noopener,noreferrer");
          break;
        }
        case "d":
          if (selected?.thread) setAside(selected, "hidden");
          break;
        case "r":
          if (selected?.thread) setAside(selected, "replied");
          break;
        case "z":
          if (lastSetAside.current) {
            const last = lastSetAside.current;
            lastSetAside.current = null;
            undo(last);
          }
          break;
        case "Escape":
          if (!selected) return;
          select(null, false);
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [move, selected, setAside, undo, select]);

  const card = (e: EntryView) => {
    const active = e.key === selected?.key;
    return (
      <li key={e.key}>
        <button
          type="button"
          ref={(el) => {
            if (el) cardRefs.current.set(e.key, el);
            else cardRefs.current.delete(e.key);
          }}
          aria-current={active ? "true" : undefined}
          // The topic is clamped to three lines: the full text on hover.
          title={e.topicQuote ? `“${e.topic}”` : e.topic}
          onClick={() => select(active ? null : e.key, false)}
          className={cn(
            "flex w-full flex-col gap-2 rounded-2xl border bg-card p-4 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
            active && "border-primary ring-1 ring-primary",
          )}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2 py-px text-xs font-medium whitespace-nowrap",
                e.kind === "answer"
                  ? "border-transparent bg-primary-soft text-primary-soft-foreground"
                  : "border-input",
              )}
            >
              {e.tag}
            </span>
            <PersonTag entry={e} />
            <span className="ml-auto truncate pl-2 text-xs whitespace-nowrap text-muted-foreground">
              {e.handle} ·{" "}
              <time title={e.whenTitle} className="font-mono">
                {e.when}
              </time>
            </span>
          </span>
          <span
            className={cn(
              "line-clamp-3 font-heading text-lg leading-snug",
              e.topicQuote && "italic",
            )}
          >
            {e.topicQuote ? `“${e.topic}”` : e.topic}
          </span>
          {e.context && (
            <span className="line-clamp-1 text-sm text-muted-foreground">
              {e.context}
            </span>
          )}
          {(foot(e) || e.also.length > 0) && (
            <span className="flex items-baseline gap-3 text-sm">
              {foot(e) && (
                <span
                  className={cn(
                    e.known && !e.waiting
                      ? "text-muted-foreground"
                      : "text-primary-soft-foreground",
                  )}
                >
                  {foot(e)}
                </span>
              )}
              {e.also.length > 0 && (
                <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
                  +{e.also.length} more{" "}
                  {e.also.length === 1 ? "thread" : "threads"}
                </span>
              )}
            </span>
          )}
        </button>
      </li>
    );
  };

  if (!visible.length && !(more.length && !showMore)) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div>{empty}</div>
        <div className="hidden lg:block">{aside}</div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <div
        className={cn(
          "flex min-w-0 flex-col gap-3",
          selected && "hidden lg:flex",
        )}
      >
        <ul aria-label="Today's people" className="flex flex-col gap-2">
          {visible.filter((e) => !extra.includes(e)).map(card)}
        </ul>
        {extra.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              You&apos;re past today&apos;s pace of {pace}. Fine to read;
              replying tomorrow is fine too.
            </p>
            <ul aria-label="More people" className="flex flex-col gap-2">
              {extra.map(card)}
            </ul>
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {more.length > 0 && !showMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowMore(true)}
            >
              Show {more.length} more new{" "}
              {more.length === 1 ? "person" : "people"}
            </Button>
          ) : (
            <span />
          )}
          <Link href="/today/hidden" className="text-sm text-muted-foreground">
            Hidden threads
          </Link>
        </div>
        <p className="hidden text-xs text-muted-foreground lg:block">
          <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>o</Kbd> open · <Kbd>r</Kbd> I
          replied · <Kbd>d</Kbd> not for me · <Kbd>z</Kbd> undo · <Kbd>Esc</Kbd>{" "}
          close
        </p>
      </div>

      <div
        ref={panelRef}
        className={cn(
          // Sticks while the feed scrolls the page; its height is fitted to
          // the window above, and a long thread scrolls inside it.
          "min-w-0 lg:sticky lg:top-4 lg:self-start lg:overflow-y-auto lg:overscroll-contain",
          !selected && "hidden lg:block",
        )}
      >
        {selected ? (
          <EntryPanel
            key={selected.key}
            entry={selected}
            mentionAdvice={mentionAdvice}
            onHide={(reason) => setAside(selected, "hidden", reason)}
            onReplied={() => setAside(selected, "replied")}
            onBack={() => {
              const key = selected.key;
              select(null, false);
              requestAnimationFrame(() => cardRefs.current.get(key)?.focus());
            }}
          />
        ) : (
          aside
        )}
      </div>
    </div>
  );
}

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
import { dismissAction, restoreAction } from "@/today/actions";
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
  const lastHidden = useRef<EntryView | null>(null);
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
    window.history.replaceState(null, "", url);
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

  const undo = useCallback(
    (entry: EntryView) => {
      setHidden((h) => {
        const next = new Set(h);
        next.delete(entry.key);
        return next;
      });
      setSelectedKey(entry.key);
      startTransition(async () => {
        const result = await restoreAction(entry.thread!.id);
        if (!result.ok) toast.error(result.error);
        router.refresh();
      });
    },
    [router],
  );

  const hide = useCallback(
    (entry: EntryView, reason?: string) => {
      if (!entry.thread) return;
      const index = visible.indexOf(entry);
      const next = visible[index + 1] ?? visible[index - 1] ?? null;
      setHidden((h) => new Set(h).add(entry.key));
      if (selectedKey === entry.key) {
        setSelectedKey(next?.key ?? null);
        if (next) requestAnimationFrame(() => select(next.key, true));
      }
      lastHidden.current = entry;
      startTransition(async () => {
        const result = await dismissAction(entry.thread!.id, reason);
        if (!result.ok) {
          setHidden((h) => {
            const n = new Set(h);
            n.delete(entry.key);
            return n;
          });
          toast.error(result.error);
          return;
        }
        toast(`Hidden: ${entry.thread!.title || "thread"}`, {
          action: { label: "Undo", onClick: () => undo(entry) },
        });
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
          if (selected?.thread) hide(selected);
          break;
        case "z":
          if (lastHidden.current) {
            const entry = lastHidden.current;
            lastHidden.current = null;
            undo(entry);
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
  }, [move, selected, hide, undo, select]);

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
          // The headline is clamped to three lines: the full text on hover.
          title={e.quote ? `“${e.headline}”` : e.headline}
          onClick={() => select(active ? null : e.key, false)}
          className={cn(
            "flex w-full gap-3 rounded-2xl border bg-card p-4 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
            active && "border-primary ring-1 ring-primary",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium",
              e.known
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {e.handle.charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <PersonTag known={e.known} />
              <time title={e.whenTitle}>{e.when}</time>
              {e.match && (
                <span className="font-medium text-primary-soft-foreground">
                  · {e.match}
                </span>
              )}
            </span>
            <span>
              <span className="font-medium">{e.handle}</span> {e.event}
            </span>
            <span
              className={cn(
                "line-clamp-3 font-heading text-[1.0625rem] leading-snug text-foreground/85",
                e.quote && "italic",
              )}
            >
              {e.quote ? `“${e.headline}”` : e.headline}
            </span>
            {e.history && (
              <span className="text-sm text-muted-foreground">{e.history}</span>
            )}
          </span>
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
          <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>o</Kbd> open · <Kbd>d</Kbd> not
          for me · <Kbd>z</Kbd> undo · <Kbd>Esc</Kbd> close
        </p>
      </div>

      <div
        ref={panelRef}
        className={cn(
          // Sticks while the feed scrolls the page; its height is fitted to
          // the window above.
          "min-w-0 lg:sticky lg:top-4 lg:self-start lg:overscroll-contain",
          !selected && "hidden lg:block",
        )}
      >
        {selected ? (
          <EntryPanel
            key={selected.key}
            entry={selected}
            mentionAdvice={mentionAdvice}
            onHide={(reason) => hide(selected, reason)}
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

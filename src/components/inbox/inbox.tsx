"use client";

import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { ScoreBadge } from "@/components/score-badge";
import { Kbd } from "@/components/ui/kbd";
import { dismissAction, restoreAction, snoozeAction } from "@/inbox/actions";
import { cn } from "@/lib/utils";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { ThreadPanel } from "./thread-panel";
import type { InboxRow, InboxView } from "./types";

type Props = {
  rows: InboxRow[];
  view: InboxView;
  initialSelectedId: string | null;
  mentionAdvice: string;
  // Shown when the list is (or becomes) empty.
  empty: React.ReactNode;
  // Links under the list, e.g. "Show more".
  footer?: React.ReactNode;
  // Both slots come from the server page as lazy elements that the client
  // can't key-validate, so they're rendered in keyed Fragments: otherwise
  // React warns about missing keys next to their siblings (dev only).
};

type Action = "dismiss" | "snooze" | "restore";

const DONE: Record<Action, string> = {
  dismiss: "Dismissed",
  snooze: "Snoozed for a day",
  restore: "Moved back to the inbox",
};

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function Inbox({
  rows,
  view,
  initialSelectedId,
  mentionAdvice,
  empty,
  footer,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Triaged here but maybe not yet gone from `rows` (optimistic).
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState(
    initialSelectedId ?? rows[0]?.id ?? null,
  );
  const [panelOpen, setPanelOpen] = useState(!!initialSelectedId);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const lastAction = useRef<{ row: InboxRow; action: Action } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const visible = useMemo(
    () => rows.filter((r) => !hidden.has(r.id)),
    [rows, hidden],
  );
  const selected =
    visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;

  // Keep ?item= in the URL so a reload or a shared link opens the same thread.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("item", selected.id);
    else url.searchParams.delete("item");
    window.history.replaceState(null, "", url);
  }, [selected]);

  const select = useCallback((id: string, focus: boolean) => {
    setSelectedId(id);
    if (focus) {
      const el = rowRefs.current.get(id);
      el?.focus();
      el?.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (!visible.length) return;
      const index = selected ? visible.indexOf(selected) : -1;
      const next =
        visible[Math.min(visible.length - 1, Math.max(0, index + delta))];
      if (next) select(next.id, true);
    },
    [visible, selected, select],
  );

  const undo = useCallback(
    (row: InboxRow, action: Action) => {
      // Undoing a restore puts it back where it was (snoozed or dismissed).
      const call =
        action === "restore"
          ? view === "snoozed"
            ? snoozeAction(row.id)
            : dismissAction(row.id)
          : restoreAction(row.id);
      setHidden((h) => {
        const next = new Set(h);
        next.delete(row.id);
        return next;
      });
      setSelectedId(row.id);
      startTransition(async () => {
        const result = await call;
        if (!result.ok) toast.error(result.error);
        router.refresh();
      });
    },
    [router, view],
  );

  const triage = useCallback(
    (row: InboxRow, action: Action, reason?: string) => {
      const index = visible.indexOf(row);
      const next = visible[index + 1] ?? visible[index - 1] ?? null;
      setHidden((h) => new Set(h).add(row.id));
      setSelectedId(next?.id ?? null);
      if (next) requestAnimationFrame(() => select(next.id, true));
      lastAction.current = { row, action };

      startTransition(async () => {
        const result =
          action === "dismiss"
            ? await dismissAction(row.id, reason)
            : action === "snooze"
              ? await snoozeAction(row.id)
              : await restoreAction(row.id);
        if (!result.ok) {
          setHidden((h) => {
            const n = new Set(h);
            n.delete(row.id);
            return n;
          });
          toast.error(result.error);
          return;
        }
        toast(`${DONE[action]}: ${row.title || "thread"}`, {
          action: { label: "Undo", onClick: () => undo(row, action) },
        });
        router.refresh();
      });
    },
    [visible, select, router, undo],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (shortcutsOpen) return;
      const triaged = view === "snoozed" || view === "dismissed";
      switch (e.key) {
        case "j":
        case "ArrowDown":
          move(1);
          break;
        case "k":
        case "ArrowUp":
          move(-1);
          break;
        case "o":
          if (selected)
            window.open(selected.url, "_blank", "noopener,noreferrer");
          break;
        case "s":
          if (selected && !triaged) triage(selected, "snooze");
          break;
        case "d":
          if (selected && !triaged) triage(selected, "dismiss");
          break;
        case "u":
          if (selected && triaged) triage(selected, "restore");
          break;
        case "z":
          if (lastAction.current) {
            const { row, action } = lastAction.current;
            lastAction.current = null;
            undo(row, action);
          }
          break;
        case "?":
          setShortcutsOpen(true);
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [move, selected, shortcutsOpen, triage, undo, view]);

  if (!visible.length) {
    return (
      <>
        <Fragment key="empty">{empty}</Fragment>
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <div
        className={cn(
          "flex min-w-0 flex-col gap-3",
          panelOpen && "hidden lg:flex",
        )}
      >
        <ul
          aria-label="Threads"
          className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card"
        >
          {visible.map((row) => {
            const active = row.id === selected?.id;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.id, el);
                    else rowRefs.current.delete(row.id);
                  }}
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    select(row.id, false);
                    setPanelOpen(true);
                  }}
                  className={cn(
                    "flex w-full gap-3 px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                    active ? "bg-primary-soft/50" : "hover:bg-accent",
                  )}
                >
                  <ScoreBadge
                    score={row.score}
                    criteriaMet={row.criteriaMet}
                    criteriaTotal={row.criteriaTotal}
                    className="h-fit"
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="line-clamp-2 font-heading text-[1.0625rem] leading-snug">
                      {row.type === "comment" && (
                        <span className="font-sans text-sm text-muted-foreground">
                          Comment in:{" "}
                        </span>
                      )}
                      {row.title || "(untitled)"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.intent} · {row.author} ·{" "}
                      <time title={row.postedTitle}>{row.postedLabel}</time>
                      {row.matched.length > 0 &&
                        ` · matched ${row.matched.map((m) => `"${m}"`).join(", ")}`}
                      {row.statusNote && ` · ${row.statusNote}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Fragment key="footer">{footer}</Fragment>
        <p className="hidden text-xs text-muted-foreground lg:block">
          <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>o</Kbd> open on HN ·{" "}
          <Kbd>s</Kbd> snooze · <Kbd>d</Kbd> dismiss · <Kbd>z</Kbd> undo ·{" "}
          <Kbd>?</Kbd> all shortcuts
        </p>
      </div>

      <div
        className={cn(
          "min-w-0 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto",
          !panelOpen && "hidden",
        )}
      >
        {selected && (
          <ThreadPanel
            key={selected.id}
            row={selected}
            view={view}
            mentionAdvice={mentionAdvice}
            onDismiss={(reason) => triage(selected, "dismiss", reason)}
            onSnooze={() => triage(selected, "snooze")}
            onRestore={() => triage(selected, "restore")}
            onBack={() => {
              setPanelOpen(false);
              requestAnimationFrame(() => select(selected.id, true));
            }}
          />
        )}
      </div>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

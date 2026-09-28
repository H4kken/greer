import { AnswersBlock } from "@/components/replies/answers-block";
import { recentAnswers } from "@/replies/answers";
import { AlertTriangleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "@/components/inbox/inbox";
import { RetrySearchesButton } from "@/components/inbox/retry-searches-button";
import type { InboxRow } from "@/components/inbox/types";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import {
  type InboxView,
  inboxCounts,
  keywordLabels,
  listInbox,
  sourceHealth,
  unscoredCount,
} from "@/inbox/queries";
import { inboxHref, PAGE_SIZE, parseInboxParams } from "@/inbox/url";
import { getLlmStatus } from "@/llm/settings";
import { explainCriteria, intentLabel } from "@/scoring/explain";
import { requireWorkspace } from "@/lib/session";
import { formatAbsolute, formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getAccountSummary } from "@/workspace/accounts";
import { getProductProfile } from "@/workspace/profile";
import { MATURITY_ADVICE } from "@/guardrails/maturity";

export const metadata: Metadata = { title: "Inbox · Greer" };

const VIEWS: { view: InboxView; label: string }[] = [
  { view: "help", label: "Needs help" },
  { view: "feedback", label: "Feedback · Show HN" },
  { view: "snoozed", label: "Snoozed" },
  { view: "dismissed", label: "Dismissed" },
];

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const params = parseInboxParams(await searchParams);
  const { workspace } = await requireWorkspace();
  const now = new Date();

  const [
    list,
    counts,
    keywords,
    health,
    account,
    profile,
    unscored,
    llm,
    answers,
  ] = await Promise.all([
    listInbox(db, workspace.id, {
      view: params.view,
      sort: params.sort,
      queryId: params.q,
      showLow: params.low,
      limit: params.n,
      now,
    }),
    inboxCounts(db, workspace.id, now),
    keywordLabels(db, workspace.id),
    sourceHealth(db, workspace.id),
    getAccountSummary(db, workspace.id, "hn"),
    getProductProfile(db, workspace.id),
    unscoredCount(db, workspace.id),
    getLlmStatus(workspace.id),
    recentAnswers(db, workspace.id, { now }),
  ]);

  const labelOf = new Map(keywords.map((k) => [k.id, k.label]));
  const rows: InboxRow[] = list.items.map((i) => ({
    id: i.id,
    title: i.title,
    url: i.url,
    author: i.author,
    type: i.type,
    category: i.category,
    postedLabel: formatRelative(i.postedAt, now),
    postedTitle: formatAbsolute(i.postedAt),
    intent: intentLabel(i.intent),
    matched: i.matchedQueryIds
      .map((id) => labelOf.get(id))
      .filter((l): l is string => !!l && l !== "Show HN launches"),
    score: i.score,
    criteriaMet: i.criteriaMet,
    criteriaTotal: i.criteriaTotal,
    criteria: explainCriteria(i.category, i.criteria, profile?.problems ?? []),
    reason: i.reason,
    text: i.text,
    statusNote:
      params.view === "snoozed" && i.snoozedUntil
        ? `back ${i.snoozedUntil.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`
        : null,
  }));

  const total =
    params.view === "help" || params.view === "feedback"
      ? counts[params.view] + (params.low ? counts[`${params.view}Low`] : 0)
      : counts[params.view];
  const lowCount =
    params.view === "help" || params.view === "feedback"
      ? counts[`${params.view}Low`]
      : 0;
  const nothingYet =
    counts.help +
      counts.feedback +
      counts.helpLow +
      counts.feedbackLow +
      counts.snoozed +
      counts.dismissed ===
    0;
  const tier = account?.tier ?? "new";
  const activeKeywords = keywords.filter((k) => k.section !== "show_hn");

  const empty = nothingYet ? (
    <EmptyState title="No threads yet">
      {unscored > 0
        ? `${unscored} found and waiting to be scored. `
        : "Greer is reading the last 7 days of Hacker News. "}
      First threads usually appear within a few minutes.
      <Link
        href="/settings#keywords"
        className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
      >
        Review your keywords
      </Link>
    </EmptyState>
  ) : params.view === "snoozed" ? (
    <EmptyState title="Nothing snoozed">
      Press <kbd>s</kbd> on a thread to bring it back tomorrow.
    </EmptyState>
  ) : params.view === "dismissed" ? (
    <EmptyState title="Nothing dismissed">
      Dismissed threads stay here, so you can move them back.
    </EmptyState>
  ) : (
    <EmptyState title="All caught up">
      {health.lastCheckAt
        ? `Last check ${formatRelative(health.lastCheckAt, now)}. Greer checks every 15 minutes.`
        : "Greer checks every 15 minutes."}
      <span className="mt-4 flex flex-wrap justify-center gap-2">
        {counts.snoozed > 0 && (
          <Link
            href={inboxHref(params, {
              view: "snoozed",
              q: undefined,
              item: undefined,
            })}
            className={buttonVariants({ variant: "outline" })}
          >
            See what you snoozed ({counts.snoozed})
          </Link>
        )}
        {lowCount > 0 && !params.low && (
          <Link
            href={inboxHref(params, { low: true, item: undefined })}
            className={buttonVariants({ variant: "outline" })}
          >
            Show {lowCount} lower matches
          </Link>
        )}
      </span>
    </EmptyState>
  );

  return (
    <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col gap-6">
        <nav aria-label="Inbox views">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {VIEWS.map(({ view, label }) => {
              const count =
                view === "help" || view === "feedback"
                  ? counts[view]
                  : counts[view];
              const active = params.view === view;
              return (
                <li key={view} className="shrink-0">
                  <Link
                    href={inboxHref(params, {
                      view,
                      item: undefined,
                      n: PAGE_SIZE,
                      low: false,
                    })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                      active
                        ? "bg-primary-soft font-medium text-primary-soft-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {label}
                    {count > 0 && <span className="font-mono">{count}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {activeKeywords.length > 0 && params.view !== "feedback" && (
          <nav aria-labelledby="keywords-nav" className="hidden lg:block">
            <h2
              id="keywords-nav"
              className="px-3 font-sans text-xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              Keywords
            </h2>
            <ul className="mt-2 flex flex-col">
              <li>
                <Link
                  href={inboxHref(params, { q: undefined, item: undefined })}
                  aria-current={!params.q ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-1.5 text-sm",
                    !params.q
                      ? "font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  All keywords
                </Link>
              </li>
              {activeKeywords.map((k) => (
                <li key={k.id}>
                  <Link
                    href={inboxHref(params, { q: k.id, item: undefined })}
                    aria-current={params.q === k.id ? "page" : undefined}
                    className={cn(
                      "block truncate rounded-lg px-3 py-1.5 text-sm",
                      params.q === k.id
                        ? "bg-primary-soft font-medium text-primary-soft-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      !k.enabled && "line-through",
                    )}
                  >
                    {k.label}
                    {!k.enabled && <span className="sr-only"> (paused)</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-3xl font-medium tracking-tight">
            {VIEWS.find((v) => v.view === params.view)!.label}
            <span className="ml-2 font-sans text-sm font-normal tracking-normal text-muted-foreground">
              {total} thread{total === 1 ? "" : "s"}
              {params.q &&
                labelOf.get(params.q) &&
                ` · "${labelOf.get(params.q)}"`}
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              HN · {MATURITY_ADVICE[tier].label} · pace ~
              {MATURITY_ADVICE[tier].repliesPerDay} replies/day
              {!account && (
                <>
                  {" "}
                  (<Link href="/accounts">connect your account</Link>)
                </>
              )}
            </span>
            {health.lastCheckAt && (
              <span>
                Last check{" "}
                <time title={formatAbsolute(health.lastCheckAt)}>
                  {formatRelative(health.lastCheckAt, now)}
                </time>
              </span>
            )}
            {(params.view === "help" || params.view === "feedback") && (
              <nav
                aria-label="Sort"
                className="flex rounded-lg border bg-card p-0.5"
              >
                {(["best", "newest"] as const).map((sort) => (
                  <Link
                    key={sort}
                    href={inboxHref(params, { sort, item: undefined })}
                    aria-current={params.sort === sort ? "page" : undefined}
                    className={cn(
                      "rounded-md px-2.5 py-1",
                      params.sort === sort
                        ? "bg-secondary font-medium text-foreground"
                        : "hover:text-foreground",
                    )}
                  >
                    {sort === "best" ? "Best match" : "Newest"}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>

        {health.failing.length > 0 && (
          <Alert>
            <AlertTriangleIcon aria-hidden />
            <AlertTitle>
              Couldn&apos;t reach Hacker News for {health.failing.length} search
              {health.failing.length === 1 ? "" : "es"}
            </AlertTitle>
            <AlertDescription>
              You&apos;re seeing threads from earlier checks. Greer retries
              automatically.
            </AlertDescription>
            <AlertAction>
              <RetrySearchesButton />
            </AlertAction>
          </Alert>
        )}
        {!llm.configured && unscored > 0 && (
          <Alert>
            <AlertTriangleIcon aria-hidden />
            <AlertTitle>{unscored} threads are waiting to be scored</AlertTitle>
            <AlertDescription>
              <p>
                Scoring needs an AI model.{" "}
                <Link href="/settings#ai">Add an API key in Settings</Link>.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {params.view === "help" && !params.q && (
          <AnswersBlock answers={answers} now={now} />
        )}

        <Inbox
          // A new list (view, filter, sort) starts with fresh local state.
          key={inboxHref(params, { item: undefined })}
          rows={rows}
          view={params.view}
          initialSelectedId={
            params.item && rows.some((r) => r.id === params.item)
              ? params.item
              : null
          }
          mentionAdvice={MATURITY_ADVICE[tier].productMentions}
          empty={empty}
          footer={
            <div className="flex flex-wrap gap-2">
              {list.hasMore && (
                <Link
                  href={inboxHref(params, {
                    n: params.n + PAGE_SIZE,
                    item: undefined,
                  })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  scroll={false}
                >
                  Show more
                </Link>
              )}
              {lowCount > 0 && (
                <Link
                  href={inboxHref(params, {
                    low: !params.low,
                    item: undefined,
                  })}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  {params.low
                    ? "Hide lower matches"
                    : `Show ${lowCount} lower matches`}
                </Link>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}

function EmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
      <h2 className="text-xl font-medium">{title}</h2>
      <p className="mt-1 flex max-w-md flex-col items-center text-sm text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

import { AlertTriangleIcon } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { PeopleNetwork } from "@/components/today/people-network";
import { DayProgress } from "@/components/today/day-progress";
import { Greeting } from "@/components/today/greeting";
import { MissingReplies } from "@/components/today/missing-replies";
import { NextCheck } from "@/components/today/next-check";
import { RetrySearchesButton } from "@/components/today/retry-searches-button";
import { TodayView } from "@/components/today/today-view";
import type { EntryView, NetworkPerson } from "@/components/today/types";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { db } from "@/db";
import { MATURITY_ADVICE } from "@/guardrails/maturity";
import { requireWorkspace } from "@/lib/session";
import { formatAbsolute, formatRelative } from "@/lib/time";
import { getWorkerHealth } from "@/lib/health";
import { getAiStatus } from "@/llm/settings";
import { explainCriteria, fitLine } from "@/scoring/explain";
import { seenSubjectsOf, type TodayEntry } from "@/today/build";
import { sameDayAs, TIME_ZONE_COOKIE } from "@/today/progress";
import {
  activityLine,
  eventLine,
  historyLine,
  matchLabel,
  sourceTag,
  summaryLine,
  topicOf,
} from "@/today/present";
import {
  hnReach,
  loadToday,
  QUIET_REACH,
  missingReplies,
  sourceHealth,
  unscoredCount,
} from "@/today/queries";
import { getAccountSummary } from "@/workspace/accounts";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "Today · Greer" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { p } = await searchParams;
  const { session, workspace } = await requireWorkspace();
  const now = new Date();
  // Saved by the browser (DayProgress): what "today" is for the viewer.
  const timeZone = (await cookies()).get(TIME_ZONE_COOKIE)?.value ?? null;

  const account = await getAccountSummary(db, workspace.id, "hn");
  const tier = account?.tier ?? "new";
  const pace = MATURITY_ADVICE[tier].repliesPerDay;
  const [today, profile, health, unscored, reach, ai, worker, missing] =
    await Promise.all([
      loadToday(db, workspace.id, {
        platform: "hn",
        pace,
        now,
        isToday: sameDayAs(now, timeZone),
      }),
      getProductProfile(db, workspace.id),
      sourceHealth(db, workspace.id),
      unscoredCount(db, workspace.id),
      hnReach(db, workspace.id, { onboardedAt: workspace.onboardedAt, now }),
      getAiStatus(workspace.id),
      getWorkerHealth(now),
      missingReplies(db, workspace.id, "hn", now),
    ]);

  const topicName = new Map(today.topics.map((t) => [t.id, t.name]));
  const problems = profile?.problems ?? [];
  const view = (e: TodayEntry): EntryView => {
    const thread =
      e.kind === "asks" || e.kind === "stuck" || e.kind === "launched"
        ? today.threads.get(e.threadId)!
        : null;
    const person = "person" in e ? e.person : null;
    const launch =
      e.kind === "launch" ? e.launch : e.kind === "answer" ? e.launch : null;
    const comment = thread?.type === "comment" && !!thread.text;
    return {
      key: e.key,
      kind: e.kind,
      known: !!person,
      waiting: person?.kind === "waiting",
      handle: e.handle,
      when: formatRelative(e.at, now),
      whenTitle: formatAbsolute(e.at),
      event: eventLine(e),
      headline:
        e.kind === "answer"
          ? e.answer.text
          : e.kind === "launch"
            ? e.launch.title
            : thread!.title || "(untitled)",
      quote: e.kind === "answer",
      tag: sourceTag(e, thread ?? undefined),
      // The card leads with the topic: their words for an answer or a
      // comment, else the title without its "Ask HN:".
      topic:
        e.kind === "answer"
          ? e.answer.text
          : comment
            ? thread!.text
            : topicOf(
                e.kind === "launch"
                  ? e.launch.title
                  : thread!.title || "(untitled)",
              ),
      topicQuote: e.kind === "answer" || comment,
      context:
        e.kind === "answer"
          ? `on “${topicOf(e.answer.threadTitle || "(untitled)")}”${e.launch ? " · launched something too" : ""}`
          : comment
            ? `in “${topicOf(thread!.title || "(untitled)")}”`
            : null,
      fit: thread
        ? (fitLine(thread.category, thread.criteria, problems) ??
          matchLabel(thread.score))
        : null,
      seen: seenSubjectsOf(e),
      activity: thread
        ? activityLine({ ...thread, checkedAt: thread.activityCheckedAt }, now)
        : null,
      history: person
        ? historyLine(
            person,
            person.topicIds
              .map((id) => topicName.get(id))
              .filter((n): n is string => !!n),
          )
        : null,
      match: thread ? matchLabel(thread.score) : null,
      thread: thread && {
        id: thread.id,
        type: thread.type,
        category: thread.category,
        title: thread.title || "(untitled)",
        text: thread.text,
        url: thread.url,
        reason: thread.reason,
        criteria: explainCriteria(thread.category, thread.criteria, problems),
      },
      answer: e.kind === "answer" ? e.answer : null,
      launch: launch && {
        title: launch.title,
        url: launch.url,
        when: formatRelative(launch.postedAt, now),
      },
      also:
        "otherThreadIds" in e
          ? e.otherThreadIds.map((id) => {
              const t = today.threads.get(id)!;
              return {
                id,
                title: t.title || "(untitled)",
                url: t.url,
                when: formatRelative(t.postedAt, now),
              };
            })
          : [],
      threads: person?.threads ?? [],
    };
  };
  const entries = today.entries.map(view);
  const more = today.more.map(view);

  const newsFrom = new Set(entries.filter((e) => e.known).map((e) => e.handle));
  const newcomers = [
    ...new Set(entries.filter((e) => !e.known).map((e) => e.handle)),
  ];
  // People already counts "I replied" marks (buildPeople); this adds the
  // day's replies when no account is linked yet, so the network still shows
  // who you just replied to.
  const inNetwork = new Set(today.people.map((p) => p.handle.toLowerCase()));
  const justReplied = [
    ...new Set(
      today.day.replies
        .map((r) => r.handle)
        .filter((h): h is string => !!h && !inNetwork.has(h.toLowerCase())),
    ),
  ];
  const meetToday = newcomers.filter((h) => !justReplied.includes(h));
  const network: NetworkPerson[] = [
    ...today.people.map((p) => ({
      handle: p.handle,
      kind: p.kind,
      conversations: p.conversations,
      news: newsFrom.has(p.handle),
    })),
    ...justReplied.map((handle) => ({
      handle,
      kind: "waiting" as const,
      conversations: 1,
      news: false,
    })),
    ...meetToday.map((handle) => ({
      handle,
      kind: "new" as const,
      conversations: 0,
      news: false,
    })),
  ];
  const networkSummary = [
    `${today.people.length} people you've talked with.`,
    newsFrom.size > 0 && `${[...newsFrom].join(", ")} have news today.`,
    justReplied.length > 0 &&
      `You replied to ${justReplied.join(", ")}, no answer yet.`,
    meetToday.length > 0 &&
      `${meetToday.join(", ")} are new people you could meet today.`,
  ]
    .filter(Boolean)
    .join(" ");

  const knownCount = new Set(
    entries.filter((e) => e.known && !e.waiting).map((e) => e.handle),
  ).size;
  const repliedCount = new Set(
    entries.filter((e) => e.waiting).map((e) => e.handle),
  ).size;
  const freshCount = entries.filter((e) => !e.known).length;
  const nothingYet = !entries.length && !more.length && !today.people.length;

  const empty = nothingYet ? (
    <EmptyState title="Nobody here yet">
      {unscored > 0
        ? `${unscored} threads found and waiting to be read. `
        : "Greer is reading the last 7 days of Hacker News. "}
      The first people usually show up within a few minutes.
    </EmptyState>
  ) : (
    <EmptyState title="All quiet today">
      {health.lastCheckAt
        ? `Last check ${formatRelative(health.lastCheckAt, now)}. Greer checks every 15 minutes.`
        : "Greer checks every 15 minutes."}
    </EmptyState>
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="flex flex-col gap-2">
            <Greeting name={session.user.name} />
            <p className="text-lg text-muted-foreground">
              {nothingYet
                ? "Greer is getting to know Hacker News for you."
                : summaryLine(knownCount, freshCount, repliedCount)}
            </p>
          </div>
          {/* Your numbers (today, this week, checks), apart from the
              invitation on the left about who's here. */}
          <div className="flex flex-col items-start gap-1 text-sm text-muted-foreground lg:max-w-md lg:shrink-0 lg:items-end lg:text-right">
            {today.me && (
              <DayProgress
                replies={today.day.replies.map((r) => ({
                  ...r,
                  at: r.at.toISOString(),
                }))}
                answers={today.day.answers.map((a) => ({
                  ...a,
                  at: a.at.toISOString(),
                }))}
                pace={pace}
                serverNow={now.getTime()}
              />
            )}
            {today.me ? (
              <Link
                href="/people"
                className="text-muted-foreground no-underline hover:text-foreground"
              >
                This week:{" "}
                <span className="text-foreground">
                  {today.week.thanked} thanked you · {today.week.talking}{" "}
                  answered you · {today.week.met} new{" "}
                  {today.week.met === 1 ? "person" : "people"}
                </span>
              </Link>
            ) : (
              <p>
                <Link href="/accounts">Connect your Hacker News account</Link>{" "}
                to see who you helped and who answers you.
              </p>
            )}
            <NextCheck
              lastCheckAt={health.lastCheckAt?.toISOString() ?? null}
              workerRunning={worker.healthy}
              serverNow={now.getTime()}
            />
          </div>
        </div>

        {reach && reach.people <= QUIET_REACH && (
          <p className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Hacker News rarely talks about what{" "}
            {profile?.productName ?? "your product"} solves:{" "}
            {reach.people === 0
              ? "nobody"
              : `${reach.people} ${reach.people === 1 ? "person" : "people"}`}{" "}
            in the last {reach.days} days. That&apos;s normal for a focused
            product: Greer only shows people who fit, and your audience may
            mostly be elsewhere (Reddit comes next). Meanwhile, you can{" "}
            <Link href="/settings#keywords">try other keywords</Link>.
          </p>
        )}

        <MissingReplies
          rows={missing.map((m) => ({
            id: m.id,
            handle: m.author,
            title: m.title || "(untitled)",
            url: m.url,
          }))}
        />

        {health.failing.length > 0 && (
          <Alert>
            <AlertTriangleIcon aria-hidden />
            <AlertTitle>
              Couldn&apos;t reach Hacker News for {health.failing.length} search
              {health.failing.length === 1 ? "" : "es"}
            </AlertTitle>
            <AlertDescription>
              You&apos;re seeing people from earlier checks. Greer retries
              automatically.
            </AlertDescription>
            <AlertAction>
              <RetrySearchesButton />
            </AlertAction>
          </Alert>
        )}
        {!ai.sorting.configured && unscored > 0 && (
          <Alert>
            <AlertTriangleIcon aria-hidden />
            <AlertTitle>{unscored} threads are waiting to be read</AlertTitle>
            <AlertDescription>
              <p>
                Greer needs a model for sorting threads to tell who could use
                your help. <Link href="/settings#ai">Pick one in Settings</Link>
                .
              </p>
            </AlertDescription>
          </Alert>
        )}

        <TodayView
          entries={entries}
          more={more}
          pace={pace}
          initialKey={typeof p === "string" ? p : null}
          mentionAdvice={MATURITY_ADVICE[tier].productMentions}
          empty={empty}
          aside={
            <PeopleNetwork
              people={network}
              summary={networkSummary}
              connected={!!today.me}
              serverNow={now.getTime()}
            />
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
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

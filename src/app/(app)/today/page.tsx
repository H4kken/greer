import { AlertTriangleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LaunchStrip } from "@/components/today/launch-strip";
import { PeopleNetwork } from "@/components/today/people-network";
import { DayProgress } from "@/components/today/day-progress";
import { Greeting } from "@/components/today/greeting";
import { NextCheck } from "@/components/today/next-check";
import { RetrySearchesButton } from "@/components/today/retry-searches-button";
import { TodayView } from "@/components/today/today-view";
import type {
  EntryView,
  LaunchView,
  NetworkPerson,
} from "@/components/today/types";
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
import { getLlmStatus } from "@/llm/settings";
import { explainCriteria } from "@/scoring/explain";
import type { TodayEntry } from "@/today/build";
import {
  eventLine,
  historyLine,
  matchLabel,
  summaryLine,
} from "@/today/present";
import { loadToday, sourceHealth, unscoredCount } from "@/today/queries";
import { getAccountSummary } from "@/workspace/accounts";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "Today · Greer" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { p } = await searchParams;
  const { session, workspace } = await requireWorkspace();
  const now = new Date();

  const account = await getAccountSummary(db, workspace.id, "hn");
  const tier = account?.tier ?? "new";
  const pace = MATURITY_ADVICE[tier].repliesPerDay;
  const [today, profile, health, unscored, llm, worker] = await Promise.all([
    loadToday(db, workspace.id, { platform: "hn", pace, now }),
    getProductProfile(db, workspace.id),
    sourceHealth(db, workspace.id),
    unscoredCount(db, workspace.id),
    getLlmStatus(workspace.id),
    getWorkerHealth(now),
  ]);

  const topicName = new Map(today.topics.map((t) => [t.id, t.name]));
  const problems = profile?.problems ?? [];
  const view = (e: TodayEntry): EntryView => {
    const thread =
      e.kind === "asks" || e.kind === "stuck"
        ? today.threads.get(e.threadId)!
        : null;
    const person = e.kind === "stuck" ? null : e.person;
    const launch =
      e.kind === "launch" ? e.launch : e.kind === "answer" ? e.launch : null;
    return {
      key: e.key,
      kind: e.kind,
      known: !!person,
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
        title: thread.title || "(untitled)",
        text: thread.text,
        url: thread.url,
        reason: thread.reason,
        criteria: explainCriteria("help", thread.criteria, problems),
      },
      answer: e.kind === "answer" ? e.answer : null,
      launch: launch && {
        title: launch.title,
        url: launch.url,
        when: formatRelative(launch.postedAt, now),
      },
      threads: person?.threads ?? [],
    };
  };
  const entries = today.entries.map(view);
  const more = today.more.map(view);

  const newsFrom = new Set(entries.filter((e) => e.known).map((e) => e.handle));
  const newcomers = [
    ...new Set(entries.filter((e) => !e.known).map((e) => e.handle)),
  ];
  const network: NetworkPerson[] = [
    ...today.people.map((p) => ({
      handle: p.handle,
      kind: p.kind,
      conversations: p.conversations,
      news: newsFrom.has(p.handle),
    })),
    ...newcomers.map((handle) => ({
      handle,
      kind: "new" as const,
      conversations: 0,
      news: false,
    })),
  ];
  const networkSummary = [
    `${today.people.length} people you've talked with.`,
    newsFrom.size > 0 && `${[...newsFrom].join(", ")} have news today.`,
    newcomers.length > 0 &&
      `${newcomers.join(", ")} are new people you could meet today.`,
  ]
    .filter(Boolean)
    .join(" ");

  const known = new Set(today.people.map((p) => p.handle.toLowerCase()));
  const launches: LaunchView[] = today.launches.map((l) => ({
    id: l.id,
    title: l.title,
    url: l.url,
    author: l.author,
    when: formatRelative(l.postedAt, now),
    helped: known.has(l.author.toLowerCase()),
  }));

  const knownCount = newsFrom.size;
  const freshCount = entries.filter((e) => e.kind === "stuck").length;
  const nothingYet =
    !entries.length && !more.length && !today.people.length && !launches.length;

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
      <LaunchStrip launches={launches} />
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="flex flex-col gap-2">
            <Greeting name={session.user.name} />
            <p className="text-lg text-muted-foreground">
              {nothingYet
                ? "Greer is getting to know Hacker News for you."
                : summaryLine(knownCount, freshCount)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 text-sm text-muted-foreground sm:items-end">
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

        {today.me && (
          // Close to the summary above: it's the same thought, about today.
          <div className="-mt-3">
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
          </div>
        )}

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
        {!llm.configured && unscored > 0 && (
          <Alert>
            <AlertTriangleIcon aria-hidden />
            <AlertTitle>{unscored} threads are waiting to be read</AlertTitle>
            <AlertDescription>
              <p>
                Greer needs an AI model to tell who could use your help.{" "}
                <Link href="/settings#ai">Add an API key in Settings</Link>.
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

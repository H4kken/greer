import { AlertTriangleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/onboarding/auto-refresh";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { ScoreBadge } from "@/components/score-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { inboxHref, parseInboxParams } from "@/inbox/url";
import { getWorkerHealth } from "@/lib/health";
import { requireWorkspace } from "@/lib/session";
import { getLlmStatus } from "@/llm/settings";
import { getScanProgress, scanDone } from "@/onboarding/scan";

export const metadata: Metadata = { title: "First scan · Greer" };

// Share of the bar for the search phase; reading and scoring fill the rest.
const SEARCH_SHARE = 0.15;

export default async function ScanStepPage() {
  const { workspace } = await requireWorkspace();
  if (!workspace.onboardedAt) redirect("/onboarding");

  const [progress, worker, llm] = await Promise.all([
    getScanProgress(db, workspace.id),
    getWorkerHealth(),
    getLlmStatus(workspace.id),
  ]);
  const done = scanDone(progress);
  const waiting = !worker.healthy || !llm.configured;
  const { people, top, queries } = progress;
  const who = people === 1 ? "person" : "people";

  const searching = queries.finished < queries.total;
  const ratio = done
    ? 1
    : searching
      ? SEARCH_SHARE * (queries.finished / Math.max(1, queries.total))
      : SEARCH_SHARE +
        (1 - SEARCH_SHARE) * (progress.scored / Math.max(1, progress.kept));
  const progressLabel = searching
    ? `${queries.finished} of ${queries.total} searches done`
    : `${progress.scored} of ${progress.kept} read`;

  const headline = !done
    ? "Reading the last 7 days of Hacker News"
    : people > 0
      ? `${people} ${who} you could help today`
      : "No one to help just yet";
  const subline = !done
    ? people > 0
      ? `Found ${people} ${who} you could help so far.`
      : "Looking for people you can genuinely help."
    : people > 0
      ? "Start with these. Take your time: a thoughtful reply beats a fast one."
      : "Nothing from the last 7 days matched well. Greer keeps looking every 15 minutes.";

  const params = parseInboxParams({});

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-4">
      {/* Slower while waiting on the worker or a key, so a fix shows up without a reload. */}
      <AutoRefresh active={!done} intervalMs={waiting ? 10_000 : 3000} />
      <OnboardingSteps current={3} />

      <section aria-labelledby="scan-heading" className="flex flex-col gap-3">
        <h1
          id="scan-heading"
          className="text-4xl leading-tight font-medium tracking-tight text-balance"
        >
          {headline}
        </h1>
        <p role="status" className="text-lg text-muted-foreground">
          {subline}
        </p>
        <div className="flex items-center gap-4 pt-2">
          <div
            role="progressbar"
            aria-label="First scan"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuetext={done ? "Done" : progressLabel}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
          <span className="font-mono text-sm text-muted-foreground">
            {done ? "Done" : progressLabel}
          </span>
        </div>
      </section>

      {!worker.healthy && (
        <Alert>
          <AlertTriangleIcon aria-hidden />
          <AlertTitle>The background worker isn&apos;t running</AlertTitle>
          <AlertDescription>
            Searches and scoring run in the worker. Start it (
            <code>pnpm worker:dev</code>, or the <code>worker</code> container).
            This page updates on its own.
          </AlertDescription>
        </Alert>
      )}
      {!llm.configured && (
        <Alert>
          <AlertTriangleIcon aria-hidden />
          <AlertTitle>Scoring is waiting for an AI model</AlertTitle>
          <AlertDescription>
            <p>
              Threads are collected, but not read yet.{" "}
              <Link href="/settings#ai">Add an API key in Settings</Link>.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {queries.failed > 0 && (
        <Alert>
          <AlertTriangleIcon aria-hidden />
          <AlertTitle>
            {queries.failed} search{queries.failed === 1 ? "" : "es"} failed
          </AlertTitle>
          <AlertDescription>
            Hacker News didn&apos;t answer. Greer retries automatically; the
            other searches aren&apos;t affected.
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Best threads so far">
        {top.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {/* Keyed by id: only threads that newly enter the list animate. */}
            {top.map((t) => (
              <li
                key={t.id}
                className="rounded-2xl border bg-card motion-safe:animate-arrive"
              >
                <Link
                  href={inboxHref(params, {
                    view: t.category === "feedback" ? "feedback" : "help",
                    item: t.id,
                  })}
                  className="flex gap-4 rounded-2xl p-5 hover:bg-accent/60"
                >
                  <ScoreBadge
                    score={t.score}
                    criteriaMet={t.criteriaMet}
                    criteriaTotal={t.criteriaTotal}
                    className="h-fit"
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-heading text-lg leading-snug text-foreground">
                      {t.title || "(untitled)"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t.category === "feedback" && "Launch · "}
                      {t.reason}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {done ? (
              <>
                Try broader keywords in{" "}
                <Link href="/settings#keywords">Settings</Link>, or check back
                later.
              </>
            ) : (
              "The best threads show up here as soon as they're read."
            )}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {done
            ? "Greer keeps looking every 15 minutes."
            : "No need to wait: the inbox fills up as Greer reads."}
        </p>
        <Link
          href="/inbox"
          className={buttonVariants({
            variant: done ? "default" : "outline",
            size: "lg",
          })}
        >
          {people > 0 ? "Meet them in your inbox" : "Open my inbox"}
        </Link>
      </div>
    </div>
  );
}

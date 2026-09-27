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
import { getLlmStatus } from "@/llm/settings";
import { formatUsd } from "@/llm/usage";
import { getWorkerHealth } from "@/lib/health";
import { requireWorkspace } from "@/lib/session";
import { getScanProgress, scanDone } from "@/onboarding/scan";

export const metadata: Metadata = { title: "First scan · Greer" };

export default async function ScanStepPage() {
  const { workspace } = await requireWorkspace();
  if (!workspace.onboardedAt) redirect("/onboarding");

  const [progress, worker, llm] = await Promise.all([
    getScanProgress(db, workspace.id, workspace.onboardedAt),
    getWorkerHealth(),
    getLlmStatus(workspace.id),
  ]);
  const done = scanDone(progress);
  const waiting = !worker.healthy || !llm.configured;

  const rows: [string, string][] = [
    [
      "Searches run",
      `${progress.queries.finished} / ${progress.queries.total}`,
    ],
    ["Posts and comments found", String(progress.found)],
    ["Passed the quick filter", String(progress.kept)],
    ["Scored", `${progress.scored} / ${progress.kept}`],
    [
      "AI cost so far",
      progress.usage.costUsd === null
        ? "Unknown for this model"
        : formatUsd(progress.usage.costUsd),
    ],
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Slower while waiting on the worker or a key, so a fix shows up without a reload. */}
      <AutoRefresh active={!done} intervalMs={waiting ? 10_000 : 3000} />
      <OnboardingSteps current={3} />

      <div className="grid gap-8 lg:grid-cols-[22rem_1fr]">
        <section aria-labelledby="scan-heading" className="flex flex-col gap-4">
          <div>
            <h1
              id="scan-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              {done ? "First scan done" : "Reading the last 7 days of HN"}
            </h1>
            <p className="mt-1 text-muted-foreground" role="status">
              {done
                ? "Greer now checks Hacker News every 15 minutes."
                : "You can open your inbox now. Scoring keeps going in the background, and Greer then checks every 15 minutes."}
            </p>
          </div>

          {!worker.healthy && (
            <Alert>
              <AlertTriangleIcon aria-hidden />
              <AlertTitle>The background worker isn&apos;t running</AlertTitle>
              <AlertDescription>
                Searches and scoring run in the worker. Start it (
                <code>pnpm worker:dev</code>, or the <code>worker</code>{" "}
                container). This page updates on its own.
              </AlertDescription>
            </Alert>
          )}
          {!llm.configured && (
            <Alert>
              <AlertTriangleIcon aria-hidden />
              <AlertTitle>Scoring is waiting for an AI model</AlertTitle>
              <AlertDescription>
                <p>
                  Threads are collected, but not scored yet.{" "}
                  <Link href="/settings#ai">Add an API key in Settings</Link>.
                </p>
              </AlertDescription>
            </Alert>
          )}
          {progress.queries.failed > 0 && (
            <Alert>
              <AlertTriangleIcon aria-hidden />
              <AlertTitle>
                {progress.queries.failed} search
                {progress.queries.failed === 1 ? "" : "es"} failed
              </AlertTitle>
              <AlertDescription>
                Hacker News didn&apos;t answer. Greer retries automatically; the
                other searches aren&apos;t affected.
              </AlertDescription>
            </Alert>
          )}

          <dl className="divide-y rounded-xl border bg-card text-sm">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <Link
            href="/inbox"
            className={buttonVariants({ className: "w-fit" })}
          >
            Open my inbox
            {progress.scored > 0 && ` (${progress.scored} scored so far)`}
          </Link>
        </section>

        <section aria-labelledby="top-heading" className="flex flex-col gap-3">
          <h2 id="top-heading" className="text-xl font-medium">
            First threads worth your time
          </h2>
          {progress.top.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              {done
                ? "Nothing scored in the last 7 days. Try broader keywords in Settings."
                : "The best threads show up here as soon as they're scored."}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {progress.top.map((t) => (
                <li
                  key={t.id}
                  className="flex gap-3 rounded-xl border bg-card p-4"
                >
                  <ScoreBadge
                    score={t.score}
                    criteriaMet={t.criteriaMet}
                    criteriaTotal={t.criteriaTotal}
                    className="h-fit"
                  />
                  <div className="min-w-0">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-heading text-lg leading-snug hover:underline"
                    >
                      {t.title || "(untitled)"}
                      <span className="sr-only"> (opens Hacker News)</span>
                    </a>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.category === "feedback" && "Launch · "}
                      {t.reason}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

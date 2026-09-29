import { AlertTriangleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AiSetup } from "@/components/onboarding/ai-setup";
import { AutoRefresh } from "@/components/onboarding/auto-refresh";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { ScoreBadge } from "@/components/score-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { getWorkerHealth } from "@/lib/health";
import { requireWorkspace } from "@/lib/session";
import { getAiSettingsView } from "@/llm/settings";
import { getScanProgress } from "@/onboarding/scan";
import { describeScan } from "@/onboarding/scan-copy";

export const metadata: Metadata = { title: "First scan · Greer" };

export default async function ScanStepPage() {
  const { workspace } = await requireWorkspace();
  if (!workspace.onboardedAt) redirect("/onboarding");

  const [progress, worker, ai] = await Promise.all([
    getScanProgress(db, workspace.id),
    getWorkerHealth(),
    getAiSettingsView(workspace.id),
  ]);
  const { done, needsModel, ratio, progressLabel, headline, subline } =
    describeScan(progress, {
      modelConfigured: ai.status.sorting.configured,
    });
  const waiting = !worker.healthy || needsModel;
  const { people, top } = progress;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-4">
      {/* Slower while waiting on the worker or a key, so a fix shows up without a reload. */}
      <AutoRefresh active={!done} intervalMs={waiting ? 10_000 : 3000} />
      <OnboardingSteps current={4} />

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
            aria-valuetext={progressLabel}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
          <span className="font-mono text-sm text-muted-foreground">
            {progressLabel}
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
      {needsModel && <AiSetup view={ai} />}
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
                  href={`/today?p=item:${t.id}`}
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
            : needsModel
              ? "You can also add a model later, in Settings."
              : "No need to wait: Today fills up as Greer reads."}
        </p>
        <Link
          href="/today"
          className={buttonVariants({
            variant: done ? "default" : "outline",
            size: "lg",
          })}
        >
          {people > 0 ? "Meet them on Today" : "Go to Today"}
        </Link>
      </div>
    </div>
  );
}

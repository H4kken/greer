import type { Metadata } from "next";
import Link from "next/link";
import { ThemeChoice } from "@/components/theme-toggle";
import { KeywordSettings } from "@/components/settings/keyword-settings";
import { JevSettingsForm } from "@/components/settings/jev-settings-form";
import { LlmSettingsForm } from "@/components/settings/llm-settings-form";
import { ProductForm } from "@/components/settings/product-form";
import { db } from "@/db";
import {
  describeJevKey,
  describeLlmSettings,
  getLlmStatus,
  getScoringStatus,
} from "@/llm/settings";
import { formatUsd, llmUsageLastDays } from "@/llm/usage";
import { requireWorkspace } from "@/lib/session";
import { getAccountSummary } from "@/workspace/accounts";
import { listHnQueries } from "@/workspace/keywords";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "Settings · Greer" };

const PROVIDER_NAMES = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  ollama: "Ollama",
  mock: "Mock (test mode)",
};

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="grid scroll-mt-8 gap-4 border-t pt-8 md:grid-cols-[16rem_1fr]"
    >
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-medium">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="max-w-xl">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const { workspace } = await requireWorkspace();
  const [profile, account, queries, llm, scoring, stored, jevKey, usage] =
    await Promise.all([
      getProductProfile(db, workspace.id),
      getAccountSummary(db, workspace.id, "hn"),
      listHnQueries(db, workspace.id),
      getLlmStatus(workspace.id),
      getScoringStatus(workspace.id),
      describeLlmSettings(workspace.id),
      describeJevKey(workspace.id),
      llmUsageLastDays(db, workspace.id, 30),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <h1 className="text-3xl font-medium tracking-tight">Settings</h1>

      <Section
        id="product"
        title="Your product"
        description="What Greer uses to judge which conversations you can help with."
      >
        <ProductForm
          mode="settings"
          initial={
            profile ?? {
              productName: "",
              productDescription: "",
              audience: "",
              problems: [""],
            }
          }
        />
      </Section>

      <Section
        id="accounts"
        title="Accounts"
        description="The platforms Greer follows your replies on."
      >
        <p className="text-sm">
          {account
            ? `Hacker News: ${account.handle}. `
            : "No account connected yet. "}
          <Link href="/accounts">Manage accounts</Link>
        </p>
      </Section>

      <Section
        id="keywords"
        title="Keywords"
        description="What Greer searches for on Hacker News, every 15 minutes."
      >
        <KeywordSettings
          initial={queries.map((q) => ({
            id: q.id,
            query: q.query,
            section: q.section,
            label: q.label,
            enabled: q.enabled,
            lastPolledAt: q.lastPolledAt?.toISOString() ?? null,
            lastError: q.lastError,
          }))}
        />
      </Section>

      <Section
        id="appearance"
        title="Appearance"
        description="Light or dark, or follow your device."
      >
        <ThemeChoice />
      </Section>

      <Section
        id="ai"
        title="AI models"
        description="Read threads, suggest keywords and read the answers to your replies. Keys are stored encrypted and only used from your server."
      >
        <div className="flex flex-col gap-8">
          <div
            role="status"
            className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-sm"
          >
            {scoring.configured ? (
              scoring.kind === "jev" ? (
                <p>
                  Scoring threads with TypeSafe Jev
                  {scoring.source === "env" && " from the server's environment"}
                  {scoring.fallback &&
                    `, or ${PROVIDER_NAMES[scoring.fallback]} when Jev is unavailable`}
                  .
                </p>
              ) : (
                <p>
                  Scoring threads with {PROVIDER_NAMES[scoring.provider]}{" "}
                  <code>{scoring.model}</code>. A TypeSafe key makes it about
                  30× cheaper.
                </p>
              )
            ) : (
              <p>
                <span className="font-medium">Not configured.</span> Threads are
                collected but not scored until you add a key.
              </p>
            )}
            {llm.configured ? (
              <p>
                {PROVIDER_NAMES[llm.provider]}
                {llm.source === "env" && " from the server's environment"}{" "}
                suggests keywords and reads answers, with{" "}
                <code>{llm.models.fast}</code>.
              </p>
            ) : (
              <p className="text-muted-foreground">
                No AI provider: keyword suggestions and answer reading are off.
              </p>
            )}
            <p className="text-muted-foreground">
              Last 30 days: {usage.calls} call{usage.calls === 1 ? "" : "s"}
              {usage.costUsd !== null && `, about ${formatUsd(usage.costUsd)}`}.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-medium">TypeSafe Jev (recommended)</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Scores every thread in a fraction of a second, for about 5 cents
                per 1,000 threads.
                {scoring.configured &&
                  scoring.kind === "jev" &&
                  scoring.source === "env" &&
                  " Saving a key here overrides the environment."}
              </p>
            </div>
            <JevSettingsForm savedKey={jevKey} />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-medium">AI provider</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Suggests keywords and reads the answers to your replies. Also
                scores threads when there&apos;s no TypeSafe key or Jev is
                unavailable.
                {llm.configured &&
                  llm.source === "env" &&
                  " Saving a key here overrides the environment."}
              </p>
            </div>
            <LlmSettingsForm stored={stored} />
          </div>
        </div>
      </Section>
    </div>
  );
}

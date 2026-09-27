import type { Metadata } from "next";
import { HnAccountForm } from "@/components/settings/hn-account-form";
import { KeywordSettings } from "@/components/settings/keyword-settings";
import { LlmSettingsForm } from "@/components/settings/llm-settings-form";
import { ProductForm } from "@/components/settings/product-form";
import { db } from "@/db";
import { describeLlmSettings, getLlmStatus } from "@/llm/settings";
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
  const [profile, account, queries, llm, stored, usage] = await Promise.all([
    getProductProfile(db, workspace.id),
    getAccountSummary(db, workspace.id, "hn"),
    listHnQueries(db, workspace.id),
    getLlmStatus(workspace.id),
    describeLlmSettings(workspace.id),
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
        id="account"
        title="Hacker News account"
        description="Its age and karma set your pacing and when product mentions are suggested."
      >
        <HnAccountForm initial={account} />
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
        id="ai"
        title="AI model"
        description="Reads threads and prepares briefs. Your key is stored encrypted and only used from your server."
      >
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border bg-card p-4 text-sm">
            {llm.configured ? (
              <p>
                Using {PROVIDER_NAMES[llm.provider]}
                {llm.source === "env" && " from the server's environment"}:{" "}
                <code>{llm.models.fast}</code> for scoring,{" "}
                <code>{llm.models.quality}</code> for briefs.
              </p>
            ) : (
              <p role="status">
                <span className="font-medium">Not configured.</span> Threads are
                collected but not scored until you add a key.
              </p>
            )}
            <p className="mt-1 text-muted-foreground">
              Last 30 days: {usage.calls} call{usage.calls === 1 ? "" : "s"}
              {usage.costUsd !== null && `, about ${formatUsd(usage.costUsd)}`}.
            </p>
          </div>
          {llm.configured && llm.source === "env" && (
            <p className="text-sm text-muted-foreground">
              Saving a key here overrides the environment.
            </p>
          )}
          <LlmSettingsForm stored={stored} />
        </div>
      </Section>
    </div>
  );
}

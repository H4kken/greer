import type { Metadata } from "next";
import Link from "next/link";
import { ThemeChoice } from "@/components/theme-toggle";
import { KeywordSettings } from "@/components/settings/keyword-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { ProductForm } from "@/components/settings/product-form";
import { db } from "@/db";
import { getAiSettingsView } from "@/llm/settings";
import { formatUsd, llmUsageLastDays } from "@/llm/usage";
import { requireWorkspace } from "@/lib/session";
import { getAccountSummary } from "@/workspace/accounts";
import { listHnQueries } from "@/workspace/keywords";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "Settings · Greer" };

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
  const now = new Date();
  const [profile, account, queries, ai, usage] = await Promise.all([
    getProductProfile(db, workspace.id),
    getAccountSummary(db, workspace.id, "hn"),
    listHnQueries(db, workspace.id),
    getAiSettingsView(workspace.id),
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
          serverNow={now.getTime()}
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
        title="AI"
        description="Greer uses AI for two jobs, and each is best done by a different kind of model. One Claude or OpenAI key can do both. Keys are stored encrypted and only used from your server."
      >
        <div className="flex flex-col gap-4">
          <AiSettings view={ai} />
          <p className="text-sm text-muted-foreground">
            Last 30 days: {usage.calls} call{usage.calls === 1 ? "" : "s"}
            {usage.costUsd !== null && `, about ${formatUsd(usage.costUsd)}`}.
          </p>
        </div>
      </Section>
    </div>
  );
}

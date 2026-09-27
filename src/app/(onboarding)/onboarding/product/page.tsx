import type { Metadata } from "next";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { ProductStep } from "@/components/onboarding/product-step";
import { LlmSettingsForm } from "@/components/settings/llm-settings-form";
import { db } from "@/db";
import { describeLlmSettings, getLlmStatus } from "@/llm/settings";
import { requireWorkspace } from "@/lib/session";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "Your product · Greer" };

export default async function ProductStepPage() {
  const { workspace } = await requireWorkspace();
  const [profile, llm, stored] = await Promise.all([
    getProductProfile(db, workspace.id),
    getLlmStatus(workspace.id),
    describeLlmSettings(workspace.id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <OnboardingSteps current={1} />
      <p className="text-sm text-muted-foreground">
        Everything here can be changed later in Settings. Nothing is posted
        anywhere: Greer only reads.
      </p>

      {!llm.configured && (
        <section
          aria-labelledby="ai-heading"
          className="flex flex-col gap-4 rounded-2xl border bg-card p-6"
        >
          <div>
            <h2 id="ai-heading" className="text-xl font-medium">
              Connect an AI model
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Greer uses it to read threads and suggest keywords. Scoring a week
              of Hacker News costs a few cents with the default models.
            </p>
          </div>
          <LlmSettingsForm stored={stored} />
        </section>
      )}

      <section
        aria-labelledby="product-heading"
        className="flex flex-col gap-4"
      >
        <div>
          <h1
            id="product-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            What are you building?
          </h1>
          <p className="mt-1 text-muted-foreground">
            Greer uses this to judge which conversations you can genuinely help
            with. Plain words work better than marketing copy.
          </p>
        </div>
        <ProductStep
          initial={
            profile ?? {
              productName: "",
              productDescription: "",
              audience: "",
              problems: ["", ""],
            }
          }
        />
      </section>
    </div>
  );
}

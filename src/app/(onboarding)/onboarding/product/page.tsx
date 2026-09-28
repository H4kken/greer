import type { Metadata } from "next";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { ProductStep } from "@/components/onboarding/product-step";
import { AiSetup } from "@/components/onboarding/ai-setup";
import { db } from "@/db";
import {
  describeJevKey,
  describeLlmSettings,
  getScoringStatus,
} from "@/llm/settings";
import { requireWorkspace } from "@/lib/session";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "Your product · Greer" };

export default async function ProductStepPage() {
  const { workspace } = await requireWorkspace();
  const [profile, scoring, stored, jevKey] = await Promise.all([
    getProductProfile(db, workspace.id),
    getScoringStatus(workspace.id),
    describeLlmSettings(workspace.id),
    describeJevKey(workspace.id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <OnboardingSteps current={1} />
      <p className="text-sm text-muted-foreground">
        Everything here can be changed later in Settings. Nothing is posted
        anywhere: Greer only reads.
      </p>

      {!scoring.configured && (
        <AiSetup
          intro="Greer uses it to read each thread and judge whether you can help."
          jevKey={jevKey}
          stored={stored}
        />
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

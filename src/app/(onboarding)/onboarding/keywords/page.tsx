import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeywordPicker } from "@/components/onboarding/keyword-picker";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { db } from "@/db";
import { requireWorkspace } from "@/lib/session";
import { listHnQueries, SHOW_HN_SECTION } from "@/workspace/keywords";
import { getProductProfile } from "@/workspace/profile";
import type { KeywordInput } from "@/workspace/schemas";

export const metadata: Metadata = { title: "Where to listen · Greer" };

// Step 3: what to search for. The HN account is step 2 (optional).
export default async function KeywordsStepPage() {
  const { workspace } = await requireWorkspace();
  if (!(await getProductProfile(db, workspace.id))) {
    redirect("/onboarding/product");
  }
  const queries = await listHnQueries(db, workspace.id);
  const saved = queries.filter(
    (q) => q.section === "ask_hn" || q.section === "story_comment",
  );

  return (
    <div className="flex flex-col gap-8">
      <OnboardingSteps current={3} />
      <div>
        <h1 className="text-3xl font-medium tracking-tight">
          Where should Greer listen?
        </h1>
        <p className="mt-1 text-muted-foreground">
          Hacker News for now. Reddit comes next.
        </p>
      </div>

      <section aria-label="Keywords and launches" className="max-w-2xl">
        <KeywordPicker
          // Coming back to this step: show what was saved instead of new suggestions.
          initialKeywords={
            queries.length
              ? saved.map((q) => ({
                  query: q.query,
                  section: q.section as KeywordInput["section"],
                }))
              : null
          }
          initialShowHn={
            queries.length
              ? queries.some((q) => q.section === SHOW_HN_SECTION)
              : // Off until suggestions say launches fit this audience.
                false
          }
        />
      </section>
    </div>
  );
}

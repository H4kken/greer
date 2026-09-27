import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeywordPicker } from "@/components/onboarding/keyword-picker";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { HnAccountForm } from "@/components/settings/hn-account-form";
import { db } from "@/db";
import { requireWorkspace } from "@/lib/session";
import { getAccountSummary } from "@/workspace/accounts";
import { listHnQueries, SHOW_HN_SECTION } from "@/workspace/keywords";
import { getProductProfile } from "@/workspace/profile";
import type { KeywordInput } from "@/workspace/schemas";

export const metadata: Metadata = { title: "Account & keywords · Greer" };

export default async function AccountStepPage() {
  const { workspace } = await requireWorkspace();
  if (!(await getProductProfile(db, workspace.id))) {
    redirect("/onboarding/product");
  }
  const [account, queries] = await Promise.all([
    getAccountSummary(db, workspace.id, "hn"),
    listHnQueries(db, workspace.id),
  ]);
  const saved = queries.filter(
    (q) => q.section === "ask_hn" || q.section === "story_comment",
  );

  return (
    <div className="flex flex-col gap-8">
      <OnboardingSteps current={2} />
      <div>
        <h1 className="text-3xl font-medium tracking-tight">
          Where should Greer listen?
        </h1>
        <p className="mt-1 text-muted-foreground">
          Hacker News for now. Reddit comes next.
        </p>
      </div>

      <section
        aria-labelledby="account-heading"
        className="flex max-w-2xl flex-col gap-4"
      >
        <h2 id="account-heading" className="text-xl font-medium">
          Your HN account
        </h2>
        <HnAccountForm initial={account} />
      </section>

      <section
        aria-labelledby="keywords-heading"
        className="flex max-w-2xl flex-col gap-4"
      >
        <h2 id="keywords-heading" className="sr-only">
          Keywords and launches
        </h2>
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
              : true
          }
        />
      </section>
    </div>
  );
}

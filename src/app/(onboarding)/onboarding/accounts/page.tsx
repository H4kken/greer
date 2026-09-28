import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountStep } from "@/components/onboarding/account-step";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { db } from "@/db";
import { requireWorkspace } from "@/lib/session";
import { getAccountSummary } from "@/workspace/accounts";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "Your accounts · Greer" };

// Step 2, optional. Linking the account lets Greer follow your replies (who
// answered, who came back) and pace you by the account's age and karma.
export default async function AccountsStepPage() {
  const { workspace } = await requireWorkspace();
  const [profile, account] = await Promise.all([
    getProductProfile(db, workspace.id),
    getAccountSummary(db, workspace.id, "hn"),
  ]);
  if (!profile) redirect("/onboarding/product");

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <OnboardingSteps current={2} />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">
          Connect your accounts
        </h1>
        <p className="text-muted-foreground">
          Greer follows your public replies, so it can show you who answered,
          who came back and who you&apos;ve helped. It only reads public
          profiles: no password, and it never posts for you.
        </p>
      </div>
      <AccountStep initial={account} />
    </div>
  );
}

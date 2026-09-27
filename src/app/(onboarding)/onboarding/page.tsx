import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireWorkspace } from "@/lib/session";
import { getProductProfile } from "@/workspace/profile";

// Sends people to the first step they haven't finished.
export default async function OnboardingPage() {
  const { workspace } = await requireWorkspace();
  if (workspace.onboardedAt) redirect("/onboarding/scan");
  if (await getProductProfile(db, workspace.id)) {
    redirect("/onboarding/account");
  }
  redirect("/onboarding/product");
}

import type { Metadata } from "next";
import { PlatformList } from "@/components/accounts/platform-list";
import { db } from "@/db";
import { requireWorkspace } from "@/lib/session";
import { getAccountSummary } from "@/workspace/accounts";

export const metadata: Metadata = { title: "Accounts · Greer" };

export default async function AccountsPage() {
  const { workspace } = await requireWorkspace();
  const hn = await getAccountSummary(db, workspace.id, "hn");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">Accounts</h1>
        <p className="text-muted-foreground">
          Greer follows your public replies on these platforms, so it can show
          you who answered, who came back and who you&apos;ve helped. It only
          reads: it never posts for you.
        </p>
      </div>
      <PlatformList hn={hn} />
    </div>
  );
}

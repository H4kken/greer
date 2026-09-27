// The user's own platform accounts: read from public profiles, never logged into.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, platformAccount } from "@/db/schema";
import {
  accountAgeDays,
  formatAccountAge,
  MATURITY_ADVICE,
  maturityTier,
} from "@/guardrails/maturity";
import type { AccountProfile, Platform } from "@/sources/types";

export async function saveAccount(
  db: Db,
  workspaceId: string,
  platform: Platform,
  profile: AccountProfile,
  now = new Date(),
): Promise<void> {
  const values = {
    handle: profile.handle,
    accountCreatedAt: profile.createdAt,
    karma: profile.karma,
    refreshedAt: now,
  };
  await db
    .insert(platformAccount)
    .values({ workspaceId, platform, ...values })
    .onConflictDoUpdate({
      target: [platformAccount.workspaceId, platformAccount.platform],
      set: values,
    });
}

// The prefilter skips your own posts, but only once it knows your handle.
// Linking the account after the first scan hides what was already collected.
export async function markOwnPosts(
  db: Db,
  workspaceId: string,
  platform: Platform,
  handle: string,
): Promise<number> {
  const rows = await db
    .update(item)
    .set({ filterStatus: "own_post" })
    .where(
      and(
        eq(item.workspaceId, workspaceId),
        eq(item.platform, platform),
        eq(item.filterStatus, "kept"),
        sql`lower(${item.author}) = lower(${handle})`,
      ),
    )
    .returning({ id: item.id });
  return rows.length;
}

export async function removeAccount(
  db: Db,
  workspaceId: string,
  platform: Platform,
): Promise<void> {
  await db
    .delete(platformAccount)
    .where(
      and(
        eq(platformAccount.workspaceId, workspaceId),
        eq(platformAccount.platform, platform),
      ),
    );
}

export type AccountSummary = {
  handle: string;
  age: string | null;
  karma: number | null;
  tier: keyof typeof MATURITY_ADVICE;
  tierLabel: string;
  repliesPerDay: number;
  productMentions: string;
};

export function summarizeAccount(
  platform: Platform,
  row: {
    handle: string;
    accountCreatedAt: Date | null;
    karma: number | null;
  },
  now = new Date(),
): AccountSummary {
  // Unknown age or karma: advise as for a new account.
  const tier =
    row.accountCreatedAt && row.karma !== null
      ? maturityTier(
          platform,
          { createdAt: row.accountCreatedAt, karma: row.karma },
          now,
        )
      : "new";
  const advice = MATURITY_ADVICE[tier];
  return {
    handle: row.handle,
    age: row.accountCreatedAt
      ? formatAccountAge(accountAgeDays(row.accountCreatedAt, now))
      : null,
    karma: row.karma,
    tier,
    tierLabel: advice.label,
    repliesPerDay: advice.repliesPerDay,
    productMentions: advice.productMentions,
  };
}

export async function getAccountSummary(
  db: Db,
  workspaceId: string,
  platform: Platform,
): Promise<AccountSummary | null> {
  const [row] = await db
    .select()
    .from(platformAccount)
    .where(
      and(
        eq(platformAccount.workspaceId, workspaceId),
        eq(platformAccount.platform, platform),
      ),
    );
  return row ? summarizeAccount(platform, row) : null;
}

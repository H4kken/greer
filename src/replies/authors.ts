// Fills in who each of the user's replies answers. Free when Greer already
// collected the parent; otherwise one request per reply, once.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, reply } from "@/db/schema";
import type { Platform, Source } from "@/sources/types";

// Upper bound on requests per poll; the rest wait for the next one.
export const MAX_AUTHOR_LOOKUPS = 50;

export async function fillParentAuthors(
  db: Db,
  sourceFor: (platform: Platform) => Source,
  workspaceId: string,
  platform: Platform,
): Promise<{ fromItems: number; looked: number }> {
  const mine = and(
    eq(reply.workspaceId, workspaceId),
    eq(reply.platform, platform),
    isNull(reply.parentAuthor),
  );

  const fromItems = await db
    .update(reply)
    .set({ parentAuthor: item.author })
    .from(item)
    .where(
      and(
        mine,
        eq(item.workspaceId, workspaceId),
        eq(item.platform, platform),
        eq(item.externalId, reply.parentExternalId),
      ),
    )
    .returning({ id: reply.id });

  const source = sourceFor(platform);
  if (!source.fetchAuthor) return { fromItems: fromItems.length, looked: 0 };
  const missing = await db
    .select({ id: reply.id, parentExternalId: reply.parentExternalId })
    .from(reply)
    .where(mine)
    .orderBy(sql`${reply.postedAt} desc`)
    .limit(MAX_AUTHOR_LOOKUPS);
  for (const r of missing) {
    const author = await source.fetchAuthor(r.parentExternalId);
    await db
      .update(reply)
      .set({ parentAuthor: author ?? "" })
      .where(eq(reply.id, r.id));
  }
  return { fromItems: fromItems.length, looked: missing.length };
}

// Loads Explore for one workspace: every thread Greer kept and scored,
// sorted and searchable. Today is what to do now; Explore is for browsing,
// so nothing here is paced or capped by the day.
import { and, desc, eq, gte, ilike, ne, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, itemScore } from "@/db/schema";
import type { Platform } from "@/sources/types";
import { worthAReply } from "@/today/queries";
import { EXPLORE_PAGE, type ExploreFilters } from "./filters";

// For ILIKE: the user's % and _ are plain characters.
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function loadExplore(
  db: Db,
  workspaceId: string,
  {
    platform,
    me,
    filters,
    now = new Date(),
  }: {
    platform: Platform;
    // The user's handle: their own posts aren't worth exploring.
    me: string | null;
    filters: ExploreFilters;
    now?: Date;
  },
) {
  const conditions: (SQL | undefined)[] = [
    eq(item.workspaceId, workspaceId),
    eq(item.platform, platform),
    eq(item.filterStatus, "kept"),
    ne(item.triageStatus, "dismissed"),
    gte(
      item.postedAt,
      new Date(now.getTime() - filters.days * 24 * 60 * 60 * 1000),
    ),
    // Help threads, and launches themselves (not comments under them).
    filters.kind === "help"
      ? eq(item.category, "help")
      : filters.kind === "launches"
        ? and(eq(item.category, "feedback"), eq(item.type, "story"))
        : or(eq(item.category, "help"), eq(item.type, "story")),
    filters.weaker ? undefined : worthAReply(),
    me ? sql`lower(${item.author}) <> ${me.toLowerCase()}` : undefined,
  ];
  if (filters.q) {
    const like = `%${likeEscape(filters.q)}%`;
    conditions.push(or(ilike(item.title, like), ilike(item.text, like)));
  }

  const rows = await db
    .select({
      id: item.id,
      type: item.type,
      category: item.category,
      author: item.author,
      title: item.title,
      // A card's worth: the full thread is on HN.
      text: sql<string>`left(${item.text}, 600)`,
      url: item.url,
      postedAt: item.postedAt,
      triageStatus: item.triageStatus,
      score: itemScore.score,
      criteria: itemScore.criteria,
      commentCount: item.commentCount,
      repliesToItem: item.repliesToItem,
      authorActiveAt: item.authorActiveAt,
      activityCheckedAt: item.activityCheckedAt,
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(item)
    .innerJoin(itemScore, eq(itemScore.itemId, item.id))
    .where(and(...conditions))
    .orderBy(
      ...(filters.sort === "new"
        ? [desc(item.postedAt), item.id]
        : [desc(itemScore.score), desc(item.postedAt), item.id]),
    )
    .limit(EXPLORE_PAGE)
    .offset((filters.page - 1) * EXPLORE_PAGE);

  return { rows, total: rows[0]?.total ?? 0 };
}

export type ExploreRow = Awaited<
  ReturnType<typeof loadExplore>
>["rows"][number];

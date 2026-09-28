// Loads everything the People page needs for one workspace and platform.
import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { personMark, platformAccount, reply, replyAnswer } from "@/db/schema";
import type { Platform } from "@/sources/types";
import { buildPeople, type Person } from "./build";

export async function listPeople(
  db: Db,
  workspaceId: string,
  platform: Platform,
): Promise<{ me: string | null; people: Person[] }> {
  const [account] = await db
    .select({ handle: platformAccount.handle })
    .from(platformAccount)
    .where(
      and(
        eq(platformAccount.workspaceId, workspaceId),
        eq(platformAccount.platform, platform),
      ),
    );
  if (!account) return { me: null, people: [] };

  const where = <
    T extends typeof reply | typeof replyAnswer | typeof personMark,
  >(
    t: T,
  ) => and(eq(t.workspaceId, workspaceId), eq(t.platform, platform));
  const [replies, answers, marks] = await Promise.all([
    db
      .select({
        id: reply.id,
        externalId: reply.externalId,
        parentExternalId: reply.parentExternalId,
        parentAuthor: reply.parentAuthor,
        threadExternalId: reply.threadExternalId,
        threadTitle: reply.threadTitle,
        url: reply.url,
        postedAt: reply.postedAt,
      })
      .from(reply)
      .where(where(reply)),
    db
      .select({
        replyId: replyAnswer.replyId,
        externalId: replyAnswer.externalId,
        author: replyAnswer.author,
        text: replyAnswer.text,
        url: replyAnswer.url,
        postedAt: replyAnswer.postedAt,
        tone: replyAnswer.tone,
      })
      .from(replyAnswer)
      .where(where(replyAnswer)),
    db
      .select({ handle: personMark.handle, at: personMark.triedProductAt })
      .from(personMark)
      .where(and(where(personMark), isNotNull(personMark.triedProductAt))),
  ]);

  return {
    me: account.handle,
    people: buildPeople({
      me: account.handle,
      replies,
      answers,
      tried: new Map(marks.map((m) => [m.handle, m.at!])),
    }),
  };
}

// The user says someone tried their product (or takes it back).
export async function setTriedProduct(
  db: Db,
  workspaceId: string,
  platform: Platform,
  handle: string,
  tried: boolean,
  now = new Date(),
): Promise<void> {
  const triedProductAt = tried ? now : null;
  await db
    .insert(personMark)
    .values({ workspaceId, platform, handle, triedProductAt })
    .onConflictDoUpdate({
      target: [personMark.workspaceId, personMark.platform, personMark.handle],
      set: { triedProductAt },
    });
}

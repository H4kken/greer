// Loads everything the People page (and Today) need for one workspace and
// platform.
import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import {
  personMark,
  platformAccount,
  reply,
  replyAnswer,
  topic,
} from "@/db/schema";
import type { Platform } from "@/sources/types";
import {
  type AnswerFact,
  buildPeople,
  buildTopics,
  type Person,
  type ReplyFact,
  type TopicSummary,
} from "./build";

// The raw facts people are derived from: the user's replies, the answers to
// them, their marks and topics. Today and People both build on these.
export async function loadPeopleFacts(
  db: Db,
  workspaceId: string,
  platform: Platform,
): Promise<{
  me: string | null;
  replies: ReplyFact[];
  answers: AnswerFact[];
  tried: Map<string, Date>;
  topics: { id: string; name: string }[];
}> {
  const [account] = await db
    .select({ handle: platformAccount.handle })
    .from(platformAccount)
    .where(
      and(
        eq(platformAccount.workspaceId, workspaceId),
        eq(platformAccount.platform, platform),
      ),
    );
  if (!account)
    return { me: null, replies: [], answers: [], tried: new Map(), topics: [] };

  const where = <
    T extends typeof reply | typeof replyAnswer | typeof personMark,
  >(
    t: T,
  ) => and(eq(t.workspaceId, workspaceId), eq(t.platform, platform));
  const [replies, answers, marks, topics] = await Promise.all([
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
        topicId: reply.topicId,
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
    db
      .select({ id: topic.id, name: topic.name })
      .from(topic)
      .where(eq(topic.workspaceId, workspaceId)),
  ]);
  return {
    me: account.handle,
    replies,
    answers,
    tried: new Map(marks.map((m) => [m.handle, m.at!])),
    topics,
  };
}

export async function listPeople(
  db: Db,
  workspaceId: string,
  platform: Platform,
): Promise<{
  me: string | null;
  people: Person[];
  topics: TopicSummary[];
}> {
  const { me, replies, answers, tried, topics } = await loadPeopleFacts(
    db,
    workspaceId,
    platform,
  );
  if (!me) return { me: null, people: [], topics: [] };
  return {
    me,
    people: buildPeople({ me, replies, answers, tried }),
    topics: buildTopics({ me, topics, replies, answers }),
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

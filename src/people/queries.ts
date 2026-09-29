// Loads everything the People page (and Today) need for one workspace and
// platform.
import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import {
  item,
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
  type MarkFact,
  buildTopics,
  type Person,
  type ReplyFact,
  type TopicSummary,
} from "./build";

// "I replied" marks count this long while Greer looks for the reply; after
// that Today asks about it instead (see missingReplies).
export const MARKED_DAYS = 7;

// The raw facts people are derived from: the user's replies, the answers to
// them, their marks and topics. Today and People both build on these.
export async function loadPeopleFacts(
  db: Db,
  workspaceId: string,
  platform: Platform,
  now = new Date(),
): Promise<{
  me: string | null;
  replies: ReplyFact[];
  answers: AnswerFact[];
  tried: Map<string, Date>;
  marked: MarkFact[];
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
    return {
      me: null,
      replies: [],
      answers: [],
      tried: new Map(),
      marked: [],
      topics: [],
    };

  const where = <
    T extends typeof reply | typeof replyAnswer | typeof personMark,
  >(
    t: T,
  ) => and(eq(t.workspaceId, workspaceId), eq(t.platform, platform));
  const [replies, answers, marks, topics, marked] = await Promise.all([
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
    db
      .select({
        author: item.author,
        title: item.title,
        url: item.url,
        at: item.triagedAt,
      })
      .from(item)
      .where(
        and(
          eq(item.workspaceId, workspaceId),
          eq(item.platform, platform),
          eq(item.triageStatus, "replied"),
          gte(
            item.triagedAt,
            new Date(now.getTime() - MARKED_DAYS * 24 * 60 * 60 * 1000),
          ),
        ),
      ),
  ]);
  return {
    me: account.handle,
    replies,
    answers,
    tried: new Map(marks.map((m) => [m.handle, m.at!])),
    marked: marked.flatMap((m) =>
      m.author && m.at
        ? [{ author: m.author, title: m.title, url: m.url, at: m.at }]
        : [],
    ),
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
  const { me, replies, answers, tried, marked, topics } = await loadPeopleFacts(
    db,
    workspaceId,
    platform,
  );
  if (!me) return { me: null, people: [], topics: [] };
  return {
    me,
    people: buildPeople({ me, replies, answers, tried, marked }),
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

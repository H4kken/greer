import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  item,
  itemScore,
  platformAccount,
  reply,
  replyAnswer,
  sourceQuery,
  workspace,
} from "@/db/schema";
import { dismissItem, markReplied, restoreItem } from "@/today/triage";
import {
  hiddenThreads,
  hnReach,
  loadToday,
  MIN_SCORE,
  missingReplies,
  sourceHealth,
  unscoredCount,
} from "@/today/queries";
import { saveAccount } from "@/workspace/accounts";
import { truncateAll } from "../helpers/truncate";

const now = new Date("2026-09-28T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
let ws: string;
let n = 0;

async function createWorkspace() {
  const [row] = await db
    .insert(workspace)
    .values({ name: "Test" })
    .returning({ id: workspace.id });
  return row!.id;
}

async function addItem(
  over: {
    score?: number | null;
    category?: "help" | "feedback";
    // How the thread matches the builder's problems (help threads).
    match?: "none" | "weak" | "clear" | "strong";
    author?: string;
    title?: string;
    postedAt?: Date;
    filterStatus?: "kept" | "too_short";
    workspaceId?: string;
  } = {},
) {
  n++;
  const workspaceId = over.workspaceId ?? ws;
  const [row] = await db
    .insert(item)
    .values({
      workspaceId,
      platform: "hn",
      externalId: String(n),
      type: "story",
      author: over.author ?? `person${n}`,
      title: over.title ?? `Item ${n}`,
      text: "text",
      url: `u${n}`,
      threadId: String(n),
      postedAt: over.postedAt ?? new Date(now.getTime() - n * 60_000),
      category: over.category ?? "help",
      filterStatus: over.filterStatus ?? "kept",
      matchedQueryIds: [],
      raw: {},
    })
    .returning({ id: item.id });
  if (over.score !== null) {
    await db.insert(itemScore).values({
      itemId: row!.id,
      workspaceId,
      score: over.score ?? 80,
      criteriaMet: 4,
      criteriaTotal: 5,
      criteria: { problem_match: over.match ?? "clear", matched_problem: 1 },
      intent: "asking_for_help",
      reason: "r",
      promptVersion: "v",
      model: "m",
    });
  }
  return row!.id;
}

const load = (pace = 3, workspaceId = ws, at = now) =>
  loadToday(db, workspaceId, { platform: "hn", pace, now: at });
const keys = async (pace = 3) => (await load(pace)).entries.map((e) => e.key);
const key = (id: string) => `item:${id}`;

describe("Today", () => {
  beforeEach(async () => {
    await truncateAll();
    ws = await createWorkspace();
  });

  it("leaves out help threads that match none of the builder's problems", async () => {
    const loose = await addItem({ match: "weak" });
    await addItem({ match: "none", score: 90 }); // clear, detailed, off-topic
    await addItem({ category: "feedback" }); // launches: their own criteria
    const { entries, more } = await load(10);
    expect([...entries, ...more].map((e) => e.key)).toHaveLength(2);
    expect(entries.map((e) => e.key)).toContain(`item:${loose}`);
  });

  it("picks the best scored, kept help threads, up to the pace", async () => {
    const older = await addItem({ score: 90, postedAt: hoursAgo(48) });
    const newer = await addItem({ score: 90, postedAt: hoursAgo(2) });
    const top = await addItem({ score: 95 });
    const fourth = await addItem({ score: MIN_SCORE });
    await addItem({ score: MIN_SCORE - 1 }); // not worth a reply
    await addItem({ score: null }); // not read yet
    await addItem({ filterStatus: "too_short" });
    // A launch by someone new, scored like the rest.
    const launch = await addItem({ category: "feedback" });

    const today = await load();
    expect(today.entries.map((e) => e.key)).toEqual(
      [top, newer, older].map(key),
    );
    expect(today.more.map((e) => `${e.kind}:${e.key}`)).toEqual([
      `launched:${key(launch)}`,
      `stuck:${key(fourth)}`,
    ]);
    expect(today.me).toBeNull();
    expect(await unscoredCount(db, ws)).toBe(1);
  });

  it("hides a thread with Not for me, and brings it back", async () => {
    const a = await addItem();
    const b = await addItem();

    expect(await dismissItem(db, ws, a, "news, not a person", now)).toBe(true);
    expect(await keys()).toEqual([key(b)]);
    expect((await hiddenThreads(db, ws)).map((h) => h.id)).toEqual([a]);

    expect(await restoreItem(db, ws, a)).toBe(true);
    expect(await keys()).toEqual([key(a), key(b)]);
    expect(await hiddenThreads(db, ws)).toEqual([]);
  });

  it("takes a thread off with I replied, and counts it once in the day", async () => {
    await saveAccount(db, ws, "hn", {
      handle: "mathisg",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      karma: 212,
    });
    const a = await addItem({ author: "kvn" });
    const b = await addItem({ author: "lena" });

    expect(await markReplied(db, ws, a, hoursAgo(1))).toBe(true);
    expect(await keys()).toEqual([key(b)]);
    expect((await load()).day.replies).toEqual([
      { id: `mark:${a}`, at: hoursAgo(1), handle: "kvn" },
    ]);
    // Not hidden: it doesn't show in Hidden threads.
    expect(await hiddenThreads(db, ws)).toEqual([]);

    // Once Greer finds the actual reply, it counts once, as the reply.
    const [thread] = await db
      .select({ threadId: item.threadId })
      .from(item)
      .where(eq(item.id, a));
    const [r] = await db
      .insert(reply)
      .values({
        workspaceId: ws,
        platform: "hn",
        externalId: "c9",
        parentExternalId: "p9",
        parentAuthor: "kvn",
        threadExternalId: thread!.threadId,
        threadTitle: "t",
        text: "x",
        url: "u",
        postedAt: hoursAgo(1),
        raw: {},
      })
      .returning({ id: reply.id });
    expect((await load()).day.replies).toEqual([
      { id: r!.id, at: hoursAgo(1), handle: "kvn" },
    ]);

    // Undo makes it new again.
    expect(await restoreItem(db, ws, a)).toBe(true);
  });

  it("offers only the room left in today's pace, the rest past it", async () => {
    await saveAccount(db, ws, "hn", {
      handle: "mathisg",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      karma: 212,
    });
    const helped = await addItem({ author: "kvn", score: 95 });
    const a = await addItem({ author: "lena", score: 90 });
    const b = await addItem({ author: "pjt", score: 85 });
    await markReplied(db, ws, helped, hoursAgo(1));

    // Pace 2, one person helped today: one new person, one waiting.
    const today = await load(2);
    expect(today.entries.map((e) => e.key)).toEqual([key(a)]);
    expect(today.more.map((e) => e.key)).toEqual([key(b)]);
  });

  it("asks about marked replies Greer still hasn't found", async () => {
    await saveAccount(db, ws, "hn", {
      handle: "mathisg",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      karma: 212,
    });
    const checked = (at: Date) =>
      db
        .update(platformAccount)
        .set({ repliesCheckedAt: at })
        .where(eq(platformAccount.workspaceId, ws));
    const missing = async () =>
      (await missingReplies(db, ws, "hn", now)).map((m) => m.id);

    const lost = await addItem({ author: "kvn" });
    const found = await addItem({ author: "lena" });
    const recent = await addItem({ author: "pjt" });
    await markReplied(db, ws, lost, hoursAgo(3));
    await markReplied(db, ws, found, hoursAgo(3));
    await markReplied(db, ws, recent, hoursAgo(1)); // too soon to ask
    const [f] = await db
      .select({ threadId: item.threadId })
      .from(item)
      .where(eq(item.id, found));
    await db.insert(reply).values({
      workspaceId: ws,
      platform: "hn",
      externalId: "c7",
      parentExternalId: "p7",
      parentAuthor: "lena",
      threadExternalId: f!.threadId,
      threadTitle: "t",
      text: "x",
      url: "u",
      postedAt: hoursAgo(3),
      raw: {},
    });

    // No check since the marks (worker down): not a miss yet.
    await checked(hoursAgo(4));
    expect(await missing()).toEqual([]);

    await checked(hoursAgo(0.25));
    expect(await missing()).toEqual([lost]);

    // "Forget it" removes the mark.
    await restoreItem(db, ws, lost);
    expect(await missing()).toEqual([]);
  });

  it("handles the same launch posted twice as one thread", async () => {
    await saveAccount(db, ws, "hn", {
      handle: "mathisg",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      karma: 212,
    });
    const title = "Show HN: Nibia Fabric";
    const first = await addItem({
      author: "abelop",
      title,
      category: "feedback",
      postedAt: hoursAgo(6),
    });
    const again = await addItem({
      author: "abelop",
      title,
      category: "feedback",
      postedAt: hoursAgo(5.9),
    });
    // One card, not "+1 more thread" with the same title.
    const before = await load();
    expect(before.entries).toHaveLength(1);
    expect(before.entries[0]).toMatchObject({ otherThreadIds: [] });
    const [lead, copy] =
      before.entries[0]!.key === key(first) ? [first, again] : [again, first];

    // "I replied" takes the whole person off, the copy included.
    await markReplied(db, ws, lead, hoursAgo(1));
    expect([...(await load()).entries, ...(await load()).more]).toEqual([]);

    // Greer finds the reply; a second mark on the copy doesn't count twice,
    // and abelop's launch isn't news: the user already replied to it.
    const [t] = await db
      .select({ threadId: item.threadId })
      .from(item)
      .where(eq(item.id, lead));
    await db.insert(reply).values({
      workspaceId: ws,
      platform: "hn",
      externalId: "c8",
      parentExternalId: t!.threadId,
      parentAuthor: "abelop",
      threadExternalId: t!.threadId,
      threadTitle: title,
      text: "x",
      url: "u",
      postedAt: hoursAgo(1),
      raw: {},
    });
    await markReplied(db, ws, copy, hoursAgo(1));
    const today = await load();
    expect(today.entries).toEqual([]);
    expect(today.day.replies.map((r) => r.handle)).toEqual(["abelop"]);

    // Nor does Greer ask about the copy's mark later.
    await db
      .update(platformAccount)
      .set({ repliesCheckedAt: hoursAgo(0.25) })
      .where(eq(platformAccount.workspaceId, ws));
    await db
      .update(item)
      .set({ triagedAt: hoursAgo(3) })
      .where(eq(item.id, copy));
    expect(await missingReplies(db, ws, "hn", now)).toEqual([]);
  });

  it("brings back threads the old inbox snoozed once the snooze ends", async () => {
    const a = await addItem();
    await db
      .update(item)
      .set({ triageStatus: "snoozed", snoozedUntil: hoursAgo(-2) })
      .where(eq(item.id, a));
    expect(await keys()).toEqual([]);
    expect(
      (await load(3, ws, new Date(now.getTime() + 3 * 3_600_000))).entries,
    ).toHaveLength(1);
  });

  it("shows people you know with news, launches, and this week", async () => {
    await saveAccount(db, ws, "hn", {
      handle: "mathisg",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      karma: 212,
    });
    const [r] = await db
      .insert(reply)
      .values({
        workspaceId: ws,
        platform: "hn",
        externalId: "c1",
        parentExternalId: "p1",
        parentAuthor: "sarahk",
        threadExternalId: "t1",
        threadTitle: "Ask HN: Pricing?",
        text: "Try annual plans.",
        url: "https://news.ycombinator.com/item?id=c1",
        postedAt: hoursAgo(30),
        raw: {},
      })
      .returning({ id: reply.id });
    await db.insert(replyAnswer).values({
      workspaceId: ws,
      replyId: r!.id,
      platform: "hn",
      externalId: "a1",
      author: "sarahk",
      text: "Thanks, trying it tonight.",
      url: "https://news.ycombinator.com/item?id=a1",
      postedAt: hoursAgo(3),
      tone: "thanks",
    });
    const launch = await addItem({
      category: "feedback",
      author: "sarahk",
      postedAt: hoursAgo(4),
    });
    const asks = await addItem({ author: "sarahk", score: 60 });
    const stuck = await addItem({ score: 90 });

    const today = await load();
    // A new person stuck, then sarahk twice: her new thread, her thanks.
    expect(today.entries.map((e) => `${e.kind}:${e.key}`)).toEqual([
      `stuck:${key(stuck)}`,
      `asks:${key(asks)}`,
      "answer:person:sarahk",
    ]);
    expect(today.entries[2]).toMatchObject({
      answer: { text: "Thanks, trying it tonight.", open: false },
      launch: { id: launch },
    });
    expect(today.launches.map((l) => l.id)).toEqual([launch]);
    // First replied to sarahk 30 hours ago: met this week.
    expect(today.week).toEqual({ thanked: 1, talking: 1, met: 1 });
    // The last two days, for "you helped N people today".
    expect(today.day.replies).toEqual([
      { id: r!.id, at: hoursAgo(30), handle: "sarahk" },
    ]);
    expect(today.day.answers).toEqual([{ at: hoursAgo(3), author: "sarahk" }]);
  });

  it("says how many people HN brought lately, once past the first week", async () => {
    const reach = (onboardedAt: Date | null) =>
      hnReach(db, ws, { onboardedAt, now });
    await addItem({ author: "kvn", postedAt: hoursAgo(24) });
    await addItem({ author: "KVN", postedAt: hoursAgo(48) }); // same person
    await addItem({ author: "lena", postedAt: hoursAgo(72) });
    await addItem({ author: "old", postedAt: hoursAgo(24 * 20) }); // too old
    await addItem({ author: "meh", score: MIN_SCORE - 1 }); // not a fit

    expect(await reach(null)).toBeNull(); // still onboarding
    expect(await reach(hoursAgo(24 * 3))).toBeNull(); // too early to tell
    expect(await reach(hoursAgo(24 * 30))).toEqual({ people: 2, days: 14 });
  });

  it("never shows or touches another workspace's threads", async () => {
    const other = await createWorkspace();
    const theirs = await addItem({ workspaceId: other });
    expect(await dismissItem(db, ws, theirs)).toBe(false);
    expect(await keys()).toEqual([]);
    expect((await load(3, other)).entries).toHaveLength(1);
    expect(await hiddenThreads(db, ws)).toEqual([]);
  });

  it("reports the last check and failing searches", async () => {
    await db.insert(sourceQuery).values([
      {
        workspaceId: ws,
        platform: "hn",
        label: "ok",
        query: "ok",
        section: "ask_hn",
        lastPolledAt: now,
      },
      {
        workspaceId: ws,
        platform: "hn",
        label: "bad",
        query: "bad",
        section: "ask_hn",
        lastError: "HTTP 503",
        lastErrorAt: now,
      },
      {
        workspaceId: ws,
        platform: "hn",
        label: "off",
        query: "off",
        section: "ask_hn",
        enabled: false,
        lastError: "old",
      },
    ]);
    const health = await sourceHealth(db, ws);
    expect(health.lastCheckAt).toEqual(now);
    expect(health.failing.map((f) => f.label)).toEqual(["bad"]);
  });
});

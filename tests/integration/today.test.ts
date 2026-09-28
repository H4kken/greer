import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  item,
  itemScore,
  reply,
  replyAnswer,
  sourceQuery,
  workspace,
} from "@/db/schema";
import { dismissItem, restoreItem } from "@/today/triage";
import {
  hiddenThreads,
  loadToday,
  MIN_SCORE,
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
    author?: string;
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
      title: `Item ${n}`,
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
      criteria: {},
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

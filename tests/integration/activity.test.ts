import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { item, itemScore, workspace } from "@/db/schema";
import type { Source, ThreadActivity } from "@/sources/types";
import { refreshActivity } from "@/today/activity";
import { truncateAll } from "../helpers/truncate";

const now = new Date("2026-09-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
let ws: string;
let n = 0;

async function addItem(
  over: {
    score?: number;
    postedAt?: Date;
    triageStatus?: "new" | "dismissed";
    checkedAt?: Date | null;
  } = {},
) {
  n++;
  const [row] = await db
    .insert(item)
    .values({
      workspaceId: ws,
      platform: "hn",
      externalId: String(n),
      type: "story",
      author: `person${n}`,
      title: `Item ${n}`,
      text: "text",
      url: `u${n}`,
      threadId: String(n),
      postedAt: over.postedAt ?? hoursAgo(2),
      category: "help",
      filterStatus: "kept",
      matchedQueryIds: [],
      raw: {},
      triageStatus: over.triageStatus ?? "new",
      activityCheckedAt: over.checkedAt ?? null,
    })
    .returning({ id: item.id });
  await db.insert(itemScore).values({
    itemId: row!.id,
    workspaceId: ws,
    score: over.score ?? 80,
    criteriaMet: 4,
    criteriaTotal: 5,
    criteria: {},
    intent: "asking_for_help",
    reason: "",
    promptVersion: "v",
    model: "m",
  });
  return row!.id;
}

// A source that answers from a table by thread id, and records the calls.
function fakeSource(answers: Record<string, ThreadActivity | Error>) {
  const calls: string[] = [];
  const source = {
    platform: "hn",
    async fetchActivity({ threadId }: { threadId: string }) {
      calls.push(threadId);
      const a = answers[threadId];
      if (!a || a instanceof Error) throw a ?? new Error("unknown thread");
      return a;
    },
  } as unknown as Source;
  return { sourceFor: () => source, calls };
}

const activityOf = async (id: string) =>
  (
    await db
      .select({
        comments: item.commentCount,
        replies: item.repliesToItem,
        authorAt: item.authorActiveAt,
        checkedAt: item.activityCheckedAt,
      })
      .from(item)
      .where(eq(item.id, id))
  )[0];

describe("refreshActivity", () => {
  beforeEach(async () => {
    await truncateAll();
    const [row] = await db
      .insert(workspace)
      .values({ name: "Test" })
      .returning({ id: workspace.id });
    ws = row!.id;
  });

  it("checks only threads Today could show, when they're due", async () => {
    const due = await addItem();
    const stale = await addItem({ checkedAt: hoursAgo(1) });
    await addItem({ checkedAt: new Date(now.getTime() - 10 * 60_000) }); // fresh
    await addItem({ score: 30 }); // not worth a reply
    await addItem({ postedAt: hoursAgo(100) }); // too old
    await addItem({ triageStatus: "dismissed" });

    const busy = {
      comments: 84,
      repliesToItem: 2,
      authorActiveAt: hoursAgo(1),
    };
    const { sourceFor, calls } = fakeSource({
      "1": busy,
      "2": { comments: 0, repliesToItem: 0, authorActiveAt: null },
    });
    expect(await refreshActivity(db, sourceFor, now)).toEqual({
      checked: 2,
      failed: 0,
    });
    expect(calls.sort()).toEqual(["1", "2"]);
    expect(await activityOf(due)).toEqual({
      comments: 84,
      replies: 2,
      authorAt: hoursAgo(1),
      checkedAt: now,
    });
    expect((await activityOf(stale))!.comments).toBe(0);

    // Checked just now: nothing is due.
    expect(await refreshActivity(db, sourceFor, now)).toEqual({
      checked: 0,
      failed: 0,
    });
  });

  it("skips a failed check and tries it again next sweep", async () => {
    const broken = await addItem();
    const fine = await addItem();
    const { sourceFor } = fakeSource({
      [String(n - 1)]: new Error("Algolia is down"),
      [String(n)]: { comments: 3, repliesToItem: 1, authorActiveAt: null },
    });
    expect(await refreshActivity(db, sourceFor, now)).toEqual({
      checked: 1,
      failed: 1,
    });
    expect((await activityOf(broken))!.checkedAt).toBeNull();
    expect((await activityOf(fine))!.comments).toBe(3);
  });
});

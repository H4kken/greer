import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { item, itemScore, workspace } from "@/db/schema";
import { DEFAULT_FILTERS, type ExploreFilters } from "@/explore/filters";
import { loadExplore } from "@/explore/queries";
import { dismissItem, markReplied } from "@/today/triage";
import { truncateAll } from "../helpers/truncate";

const now = new Date("2026-09-28T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
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
    score?: number;
    category?: "help" | "feedback";
    type?: "story" | "comment";
    match?: "none" | "weak" | "clear" | "strong";
    author?: string;
    title?: string;
    text?: string;
    postedAt?: Date;
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
      type: over.type ?? "story",
      author: over.author ?? `person${n}`,
      title: over.title ?? `Item ${n}`,
      text: over.text ?? "text",
      url: `u${n}`,
      threadId: String(n),
      postedAt: over.postedAt ?? new Date(now.getTime() - n * 60_000),
      category: over.category ?? "help",
      filterStatus: "kept",
      matchedQueryIds: [],
      raw: {},
    })
    .returning({ id: item.id });
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
  return row!.id;
}

const explore = async (
  filters: Partial<ExploreFilters> = {},
  { me = null as string | null, workspaceId = ws } = {},
) =>
  loadExplore(db, workspaceId, {
    platform: "hn",
    me,
    filters: { ...DEFAULT_FILTERS, ...filters },
    now,
  });
const ids = async (...args: Parameters<typeof explore>) =>
  (await explore(...args)).rows.map((r) => r.id);

describe("Explore", () => {
  beforeEach(async () => {
    await truncateAll();
    ws = await createWorkspace();
  });

  it("lists good matches by score, with no pace or daily cap", async () => {
    const low = await addItem({ score: 60 });
    const high = await addItem({ score: 90 });
    const many = await Promise.all(
      Array.from({ length: 20 }, () => addItem({ score: 70 })),
    );
    const { rows, total } = await explore();
    expect(total).toBe(22);
    expect(rows[0]!.id).toBe(high);
    expect(rows.at(-1)!.id).toBe(low);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(many));
  });

  it("shows weaker matches only when asked", async () => {
    const good = await addItem();
    const low = await addItem({ score: 30 });
    const offTopic = await addItem({ match: "none" });
    expect(await ids()).toEqual([good]);
    expect(await ids({ weaker: true })).toEqual(
      expect.arrayContaining([good, low, offTopic]),
    );
  });

  it("filters by kind, leaving out comments under launches", async () => {
    const help = await addItem();
    const launch = await addItem({ category: "feedback" });
    await addItem({ category: "feedback", type: "comment" });
    expect(await ids({ kind: "help" })).toEqual([help]);
    expect(await ids({ kind: "launches" })).toEqual([launch]);
    expect(new Set(await ids())).toEqual(new Set([help, launch]));
  });

  it("searches titles and text, treating % and _ as plain text", async () => {
    const title = await addItem({ title: "How do you price a SaaS?" });
    const text = await addItem({ text: "we raised prices 20%" });
    await addItem({ title: "Something else" });
    expect(new Set(await ids({ q: "PRIC" }))).toEqual(new Set([title, text]));
    expect(await ids({ q: "20%" })).toEqual([text]);
    expect(await ids({ q: "%" })).toEqual([text]);
  });

  it("sorts by newest and limits to the chosen days", async () => {
    const old = await addItem({ postedAt: daysAgo(10), score: 99 });
    const recent = await addItem({ postedAt: daysAgo(1), score: 60 });
    const newest = await addItem({ postedAt: daysAgo(0.1), score: 70 });
    expect(await ids({ sort: "new" })).toEqual([newest, recent]);
    expect(await ids({ days: 30 })).toEqual([old, newest, recent]);
  });

  it("hides dismissed threads and your own, and marks replies", async () => {
    const hidden = await addItem();
    const replied = await addItem();
    await addItem({ author: "Me_Here" });
    await dismissItem(db, ws, hidden);
    await markReplied(db, ws, replied);
    const { rows } = await explore({}, { me: "me_here" });
    expect(rows.map((r) => [r.id, r.triageStatus])).toEqual([
      [replied, "replied"],
    ]);
  });

  it("pages through results and stays in its workspace", async () => {
    const other = await createWorkspace();
    await addItem({ workspaceId: other });
    await Promise.all(Array.from({ length: 35 }, () => addItem()));
    expect((await explore()).rows).toHaveLength(30);
    const page2 = await explore({ page: 2 });
    expect(page2.rows).toHaveLength(5);
    expect(page2.total).toBe(35);
  });
});

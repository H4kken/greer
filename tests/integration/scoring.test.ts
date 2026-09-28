import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { item, itemScore, llmCall, workspace } from "@/db/schema";
import { scoreItem, unscoredItemIds } from "@/scoring/score";
import { truncateAll } from "../helpers/truncate";

const profile = {
  productName: "Greer",
  productDescription: "Finds conversations where builders can genuinely help.",
  audience: "Indie founders",
  problems: [
    "Getting the first paying customers",
    "Getting feedback on an MVP",
  ],
};

async function createWorkspace(withProfile = true) {
  const [ws] = await db
    .insert(workspace)
    .values({ name: "Test", ...(withProfile ? profile : {}) })
    .returning({ id: workspace.id });
  return ws!.id;
}

let n = 0;
async function createItem(
  workspaceId: string,
  over: Partial<typeof item.$inferInsert> = {},
) {
  n++;
  const [row] = await db
    .insert(item)
    .values({
      workspaceId,
      platform: "hn",
      externalId: String(n),
      type: "story",
      author: "founder",
      title: "Ask HN: One month, zero paying customers – keep it or kill it?",
      text: "I launched my product a month ago and I still have no paying customers. What would you do?",
      url: `https://news.ycombinator.com/item?id=${n}`,
      threadId: String(n),
      postedAt: new Date(),
      category: "help",
      filterStatus: "kept",
      matchedQueryIds: [],
      raw: {},
      ...over,
    })
    .returning({ id: item.id });
  return row!.id;
}

describe("scoreItem (mock LLM)", () => {
  beforeAll(() => {
    process.env.LLM_PROVIDER = "mock";
  });
  afterAll(() => {
    delete process.env.LLM_PROVIDER;
  });
  beforeEach(truncateAll);

  it("scores a help thread from its criteria and logs the call", async () => {
    const ws = await createWorkspace();
    const id = await createItem(ws);

    const outcome = await scoreItem(db, id);
    expect(outcome).toEqual({ status: "scored", score: 70 }); // own 20 + seeking 20 + clear 20 + welcome 10; not specific

    const [row] = await db
      .select()
      .from(itemScore)
      .where(eq(itemScore.itemId, id));
    expect(row).toMatchObject({
      workspaceId: ws,
      score: 70,
      criteriaMet: 4,
      criteriaTotal: 5,
      intent: "asking_for_help",
      promptVersion: "score-help-v2",
      model: "mock-fast",
    });
    expect(row!.reason).toContain("Getting the first paying customers");
    expect(await db.select().from(llmCall)).toHaveLength(1);
  });

  it("scores Show HN launches with the launch prompt", async () => {
    const ws = await createWorkspace();
    const id = await createItem(ws, {
      category: "feedback",
      title: "Show HN: My first SaaS, an MVP for invoices",
      text: "Would love your feedback.",
    });
    await scoreItem(db, id);
    const [row] = await db.select().from(itemScore);
    expect(row).toMatchObject({
      intent: "sharing_launch",
      promptVersion: "score-launch-v2",
    });
  });

  it("skips filtered items and workspaces without a product profile", async () => {
    const ws = await createWorkspace();
    const filtered = await createItem(ws, { filterStatus: "too_short" });
    expect(await scoreItem(db, filtered)).toEqual({
      status: "skipped",
      reason: "filtered",
    });

    const noProfile = await createItem(await createWorkspace(false));
    expect(await scoreItem(db, noProfile)).toEqual({
      status: "skipped",
      reason: "no_product_profile",
    });
    expect(await db.select().from(llmCall)).toHaveLength(0); // no model call wasted
  });

  it("rescoring updates the single score row", async () => {
    const id = await createItem(await createWorkspace());
    await scoreItem(db, id);
    await scoreItem(db, id);
    expect(await db.select().from(itemScore)).toHaveLength(1);
  });

  it("finds only kept, unscored items in workspaces that can be scored", async () => {
    const ws = await createWorkspace();
    const unscored = await createItem(ws);
    const scored = await createItem(ws);
    await createItem(ws, { filterStatus: "dead" });
    await createItem(await createWorkspace(false));
    await scoreItem(db, scored);

    expect(await unscoredItemIds(db)).toEqual([unscored]);
  });

  it("can limit the sweep to one workspace", async () => {
    const ws = await createWorkspace();
    const other = await createWorkspace();
    const mine = await createItem(ws);
    await createItem(other);

    expect(await unscoredItemIds(db, { workspaceId: ws })).toEqual([mine]);
  });
});

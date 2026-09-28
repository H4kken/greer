import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { item, itemScore, llmCall, workspace } from "@/db/schema";
import { ScorerNotConfiguredError } from "@/llm/scorer";
import { saveJevKey } from "@/llm/settings";
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

// Jev's HTTP API, stubbed: tests never hit the network.
const noul = (v: number) => ({ type: "noul", noul: v });
function jevReplies(status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    expect(String(url)).toBe("https://api.typesafe.ai/v1/systemone");
    if (status !== 200) return new Response("nope", { status });
    return Response.json({
      model: "jev-1.13.0",
      answers: {
        own_situation: noul(0.95),
        seeking_help: noul(0.9),
        specific: noul(0.2),
        reply_welcome: noul(0.9),
        intent: {
          type: "choice",
          choice: "asking_for_help",
          confidence: 0.8,
          probabilities: { asking_for_help: 0.9, discussion: 0.1 },
        },
        problem_0: noul(0.9),
        problem_1: noul(0.1),
      },
      usage: { input_tokens: 1200, output_tokens: 40 },
    });
  });
}

describe("scoreItem with Jev", () => {
  beforeEach(truncateAll);
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LLM_PROVIDER;
  });

  it("scores with Jev when a TypeSafe key is saved, and logs the call", async () => {
    const ws = await createWorkspace();
    await saveJevKey(ws, "ts-test-key");
    const fetchSpy = jevReplies();
    const id = await createItem(ws);

    // 20×0.95 + 20×0.9 + 30×0.9 + 20×0.2 + 10×0.9 = 77
    expect(await scoreItem(db, id)).toEqual({ status: "scored", score: 77 });
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer ts-test-key",
    );

    const [row] = await db.select().from(itemScore);
    expect(row).toMatchObject({
      score: 77,
      criteriaMet: 4,
      criteriaTotal: 5,
      intent: "asking_for_help",
      reason: "",
      promptVersion: "jev-help-v1",
      model: "jev-1.13.0",
    });
    // Same criteria as the LLM's, plus the raw probabilities for tuning.
    expect(row!.criteria).toMatchObject({
      problem_match: "strong",
      matched_problem: 1,
      probabilities: { problem_0: 0.9 },
    });
    const [call] = await db.select().from(llmCall);
    expect(call).toMatchObject({
      provider: "typesafe",
      model: "jev-1.13.0",
      promptName: "score-help",
      inputTokens: 1200,
      ok: true,
    });
  });

  it("falls back to the AI provider when Jev fails", async () => {
    process.env.LLM_PROVIDER = "mock";
    const ws = await createWorkspace();
    await saveJevKey(ws, "ts-test-key");
    jevReplies(503);
    const id = await createItem(ws);

    expect(await scoreItem(db, id)).toEqual({ status: "scored", score: 70 });
    const [row] = await db.select().from(itemScore);
    expect(row!.model).toBe("mock-fast");
    const calls = await db.select().from(llmCall);
    expect(calls.map((c) => [c.provider, c.ok])).toEqual(
      expect.arrayContaining([
        ["typesafe", false],
        ["mock", true],
      ]),
    );
  });

  it("waits for a new key when TypeSafe rejects it and nothing else is set", async () => {
    const ws = await createWorkspace();
    await saveJevKey(ws, "ts-wrong-key");
    jevReplies(401);
    const id = await createItem(ws);

    await expect(scoreItem(db, id)).rejects.toThrow(ScorerNotConfiguredError);
    expect(await db.select().from(itemScore)).toHaveLength(0);
    // Still unscored, so the sweep tries again once the key is fixed.
    expect(await unscoredItemIds(db)).toEqual([id]);
  });

  it("waits, without calling anything, when no model is set at all", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const id = await createItem(await createWorkspace());

    await expect(scoreItem(db, id)).rejects.toThrow(ScorerNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

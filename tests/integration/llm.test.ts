import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { db } from "@/db";
import { aiKey, llmCall, workspace } from "@/db/schema";
import { generateStructured } from "@/llm/client";
import { LlmNotConfiguredError, resolveAiConfig } from "@/llm/config";
import { definePrompt } from "@/llm/prompt";
import {
  clearAiJob,
  describeAiSettings,
  getAiConfig,
  getAiStatus,
  saveAiJob,
} from "@/llm/settings";
import { truncateAll } from "../helpers/truncate";

const echo = definePrompt({
  name: "echo",
  version: "echo-v1",
  job: "sorting",
  system: "Repeat the word back.",
  build: (input: { word: string }) => input.word,
  schema: z.object({ word: z.string() }),
  mock: (input) => ({ word: `mock:${input.word}` }),
});

function mockModel(json: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: json }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: {
          total: 12,
          noCache: 12,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

let workspaceId: string;
const anthropicConfig = resolveAiConfig(null, {
  ANTHROPIC_API_KEY: "sk-test",
}).sorting!;

describe("LLM layer", () => {
  beforeEach(async () => {
    await truncateAll();
    const [ws] = await db
      .insert(workspace)
      .values({ name: "Test" })
      .returning({ id: workspace.id });
    workspaceId = ws!.id;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("stores the API key encrypted and resolves it back", async () => {
    await saveAiJob(workspaceId, "writing", {
      provider: "anthropic",
      model: null,
      apiKey: "sk-ant-api03-supersecretvalue",
    });

    const [row] = await db
      .select()
      .from(aiKey)
      .where(eq(aiKey.workspaceId, workspaceId));
    expect(row!.apiKeyEncrypted).not.toContain("supersecret");

    expect((await getAiConfig(workspaceId)).writing).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-ant-api03-supersecretvalue",
      source: "settings",
    });
    expect((await describeAiSettings(workspaceId)).keys.anthropic).toEqual({
      apiKey: "sk-ant-…alue",
      baseUrl: null,
    });
  });

  it("shares a provider's key between jobs, and keeps it when a job changes", async () => {
    await saveAiJob(workspaceId, "writing", {
      provider: "anthropic",
      model: null,
      apiKey: "sk-keep-me-please",
    });
    // Sorting picks Claude too, without pasting the key again.
    await saveAiJob(workspaceId, "sorting", {
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
    const config = await getAiConfig(workspaceId);
    expect(config.sorting).toMatchObject({
      apiKey: "sk-keep-me-please",
      source: "settings",
    });
    expect(config.writing?.apiKey).toBe("sk-keep-me-please");
  });

  it("clearing a job hands it back to the environment, keeping the key", async () => {
    await saveAiJob(workspaceId, "sorting", {
      provider: "typesafe",
      model: null,
      apiKey: "ts-saved",
    });
    expect((await getAiStatus(workspaceId)).sorting).toMatchObject({
      configured: true,
      provider: "typesafe",
    });
    await clearAiJob(workspaceId, "sorting");
    // No env keys in tests: sorting is unset again, the key is still saved.
    expect((await getAiStatus(workspaceId)).sorting).toEqual({
      configured: false,
    });
    expect((await describeAiSettings(workspaceId)).keys.typesafe).toBeTruthy();
  });

  it("fails with a clear error when a job has no model", async () => {
    await expect(
      generateStructured(workspaceId, echo, { word: "x" }),
    ).rejects.toThrow(LlmNotConfiguredError);
  });

  it("parses structured output and records the call with its tokens", async () => {
    const result = await generateStructured(
      workspaceId,
      echo,
      { word: "hello" },
      { config: anthropicConfig, model: mockModel('{"word":"hello"}') },
    );
    expect(result).toMatchObject({
      output: { word: "hello" },
      model: "claude-haiku-4-5",
      inputTokens: 12,
      outputTokens: 5,
    });

    const [call] = await db.select().from(llmCall);
    expect(call).toMatchObject({
      workspaceId,
      promptName: "echo",
      promptVersion: "echo-v1",
      slot: "sorting",
      ok: true,
      inputTokens: 12,
      outputTokens: 5,
    });
  });

  it("records a failed call when the output doesn't match the schema", async () => {
    await expect(
      generateStructured(
        workspaceId,
        echo,
        { word: "x" },
        {
          config: anthropicConfig,
          model: mockModel('{"unexpected":true}'),
        },
      ),
    ).rejects.toThrow();
    const [call] = await db.select().from(llmCall);
    expect(call).toMatchObject({ ok: false, promptName: "echo" });
    expect(call!.error).toBeTruthy();
  });

  it("answers from the prompt's mock in mock mode, without a model", async () => {
    const mockConfig = resolveAiConfig(null, { LLM_PROVIDER: "mock" }).sorting!;
    const result = await generateStructured(
      workspaceId,
      echo,
      { word: "hi" },
      { config: mockConfig },
    );
    expect(result.output).toEqual({ word: "mock:hi" });
  });
});

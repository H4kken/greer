import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { db } from "@/db";
import { llmCall, llmSettings, workspace } from "@/db/schema";
import { generateStructured } from "@/llm/client";
import { LlmNotConfiguredError, resolveLlmConfig } from "@/llm/config";
import { definePrompt } from "@/llm/prompt";
import {
  describeLlmSettings,
  getLlmConfig,
  saveLlmSettings,
} from "@/llm/settings";
import { truncateAll } from "../helpers/truncate";

const echo = definePrompt({
  name: "echo",
  version: "echo-v1",
  slot: "fast",
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
const anthropicConfig = resolveLlmConfig(null, {
  ANTHROPIC_API_KEY: "sk-test",
});

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
    await saveLlmSettings(workspaceId, {
      provider: "anthropic",
      apiKey: "sk-ant-api03-supersecretvalue",
    });

    const [row] = await db
      .select()
      .from(llmSettings)
      .where(eq(llmSettings.workspaceId, workspaceId));
    expect(row!.apiKeyEncrypted).not.toContain("supersecret");

    const config = await getLlmConfig(workspaceId);
    expect(config).toMatchObject({
      provider: "anthropic",
      apiKey: "sk-ant-api03-supersecretvalue",
      source: "settings",
    });
    expect((await describeLlmSettings(workspaceId))!.apiKey).toBe(
      "sk-ant-…alue",
    );
  });

  it("keeps the saved key when settings are updated without one", async () => {
    await saveLlmSettings(workspaceId, {
      provider: "anthropic",
      apiKey: "sk-keep-me-please",
    });
    await saveLlmSettings(workspaceId, {
      provider: "anthropic",
      qualityModel: "claude-sonnet-5",
    });
    expect(await getLlmConfig(workspaceId)).toMatchObject({
      apiKey: "sk-keep-me-please",
      models: { quality: "claude-sonnet-5" },
    });
  });

  it("fails with a clear error when no provider is configured", async () => {
    await expect(getLlmConfig(workspaceId)).rejects.toThrow(
      LlmNotConfiguredError,
    );
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
      slot: "fast",
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
    const mockConfig = resolveLlmConfig(null, { LLM_PROVIDER: "mock" });
    const result = await generateStructured(
      workspaceId,
      echo,
      { word: "hi" },
      { config: mockConfig },
    );
    expect(result.output).toEqual({ word: "mock:hi" });
  });
});

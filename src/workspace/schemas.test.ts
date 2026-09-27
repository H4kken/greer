import { describe, expect, it } from "vitest";
import {
  firstScanSchema,
  hnHandleSchema,
  keywordSchema,
  llmSettingsSchema,
  productProfileSchema,
} from "./schemas";

describe("productProfileSchema", () => {
  const valid = {
    productName: " Greer ",
    productDescription: "Finds conversations where builders can help.",
    audience: "",
    problems: ["Getting first customers", "  ", ""],
  };

  it("trims fields and drops empty problems", () => {
    const out = productProfileSchema.parse(valid);
    expect(out.productName).toBe("Greer");
    expect(out.problems).toEqual(["Getting first customers"]);
  });

  it("needs at least one problem", () => {
    const result = productProfileSchema.safeParse({ ...valid, problems: [""] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["problems"]);
  });
});

describe("keywords", () => {
  it("lowercases and trims keywords", () => {
    expect(
      keywordSchema.parse({ query: "  First Users ", section: "ask_hn" }),
    ).toEqual({ query: "first users", section: "ask_hn" });
  });

  it("rejects the same keyword twice in one section", () => {
    const k = { query: "launch", section: "ask_hn" };
    expect(
      firstScanSchema.safeParse({ keywords: [k, k], showHn: true }).success,
    ).toBe(false);
    expect(
      firstScanSchema.safeParse({
        keywords: [k, { ...k, section: "story_comment" }],
        showHn: true,
      }).success,
    ).toBe(true);
  });

  it("only accepts HN-shaped usernames", () => {
    expect(hnHandleSchema.safeParse("pg").success).toBe(true);
    expect(hnHandleSchema.safeParse("a b").success).toBe(false);
    expect(hnHandleSchema.safeParse("../admin").success).toBe(false);
  });
});

describe("llmSettingsSchema", () => {
  const base = {
    provider: "anthropic",
    apiKey: "",
    baseUrl: "",
    fastModel: "",
    qualityModel: "",
  };

  it("lets Anthropic use default models", () => {
    expect(llmSettingsSchema.parse(base)).toMatchObject({
      fastModel: null,
      baseUrl: null,
    });
  });

  it("needs a URL for Ollama and model names for other providers", () => {
    const ollama = llmSettingsSchema.safeParse({
      ...base,
      provider: "ollama",
      fastModel: "llama3",
      qualityModel: "llama3",
    });
    expect(ollama.error?.issues[0]?.path).toEqual(["baseUrl"]);
    const openai = llmSettingsSchema.safeParse({ ...base, provider: "openai" });
    expect(openai.error?.issues[0]?.path).toEqual(["fastModel"]);
  });
});

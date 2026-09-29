import { describe, expect, it } from "vitest";
import {
  firstScanSchema,
  hnHandleSchema,
  keywordSchema,
  aiJobSchema,
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

describe("aiJobSchema", () => {
  const base = {
    job: "sorting",
    provider: "anthropic",
    apiKey: "",
    baseUrl: "",
    model: "",
  };

  it("lets TypeSafe and Anthropic use their default models", () => {
    expect(aiJobSchema.parse(base)).toMatchObject({
      model: null,
      baseUrl: null,
    });
    expect(
      aiJobSchema.safeParse({ ...base, provider: "typesafe" }).success,
    ).toBe(true);
  });

  it("needs a model name for OpenAI and Ollama", () => {
    const openai = aiJobSchema.safeParse({ ...base, provider: "openai" });
    expect(openai.error?.issues[0]?.path).toEqual(["model"]);
  });

  it("keeps TypeSafe to sorting", () => {
    const writing = aiJobSchema.safeParse({
      ...base,
      job: "writing",
      provider: "typesafe",
    });
    expect(writing.error?.issues[0]?.path).toEqual(["provider"]);
  });
});

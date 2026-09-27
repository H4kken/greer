import { describe, expect, it } from "vitest";
import { suggestKeywords } from "./suggest-keywords";

const product = {
  name: "Greer",
  description: "Finds conversations where builders can help.",
  audience: "Indie founders",
  problems: ["Getting the first paying customers", "Doing outreach"],
};

describe("suggest-keywords prompt", () => {
  it("sends the product profile with numbered problems", () => {
    const prompt = suggestKeywords.build({ product });
    expect(prompt).toContain("The builder's product: Greer");
    expect(prompt).toContain("2. Doing outreach");
  });

  it("mocks schema-valid, deduplicated keywords", () => {
    const out = suggestKeywords.schema.parse(suggestKeywords.mock({ product }));
    const queries = out.keywords.map((k) => k.query);
    expect(queries).toContain("customers");
    expect(queries).toContain("outreach");
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("rejects long keyword lists and sentence-length keywords", () => {
    const keyword = { query: "saas", section: "ask_hn", why: "w" };
    expect(
      suggestKeywords.schema.safeParse({ keywords: Array(9).fill(keyword) })
        .success,
    ).toBe(false);
    expect(
      suggestKeywords.schema.safeParse({
        keywords: [
          keyword,
          keyword,
          { ...keyword, query: "how do i find my first customers for my saas" },
        ],
      }).success,
    ).toBe(false);
  });
});

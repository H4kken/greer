import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, exploreHref, parseFilters } from "./filters";

describe("parseFilters", () => {
  it("reads known values and falls back to defaults for the rest", () => {
    expect(
      parseFilters({
        q: "  pricing ",
        kind: "launches",
        sort: "new",
        days: "30",
        weaker: "1",
        page: "2",
      }),
    ).toEqual({
      q: "pricing",
      kind: "launches",
      sort: "new",
      days: 30,
      weaker: true,
      page: 2,
    });
    expect(
      parseFilters({ kind: "spam", sort: ["x"], days: "9", page: "-3" }),
    ).toEqual(DEFAULT_FILTERS);
  });

  it("keeps searches short and pages bounded", () => {
    expect(parseFilters({ q: "a".repeat(500) }).q).toHaveLength(100);
    expect(parseFilters({ page: "99999" }).page).toBe(100);
  });
});

describe("exploreHref", () => {
  it("leaves defaults out of the URL", () => {
    expect(exploreHref(DEFAULT_FILTERS)).toBe("/explore");
    expect(exploreHref(DEFAULT_FILTERS, { kind: "help", weaker: true })).toBe(
      "/explore?kind=help&weaker=1",
    );
  });

  it("goes back to page 1 when a filter changes, but not when paging", () => {
    const on3 = { ...DEFAULT_FILTERS, q: "seo", page: 3 };
    expect(exploreHref(on3, { sort: "new" })).toBe("/explore?q=seo&sort=new");
    expect(exploreHref(on3, { page: 4 })).toBe("/explore?q=seo&page=4");
  });
});

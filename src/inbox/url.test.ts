import { describe, expect, it } from "vitest";
import { inboxHref, PAGE_SIZE, parseInboxParams } from "./url";

describe("inbox URL params", () => {
  it("falls back to defaults for missing or unknown values", () => {
    expect(parseInboxParams({ view: "nope", n: "-3", sort: "weird" })).toEqual({
      view: "help",
      sort: "best",
      q: undefined,
      low: false,
      n: PAGE_SIZE,
      item: undefined,
    });
  });

  it("caps the page size", () => {
    expect(parseInboxParams({ n: "100000" }).n).toBe(500);
  });

  it("round-trips, keeping only non-default values", () => {
    const params = parseInboxParams({
      view: "feedback",
      sort: "newest",
      q: "abc",
      low: "1",
      n: "100",
    });
    expect(inboxHref(params)).toBe(
      "/inbox?view=feedback&sort=newest&q=abc&low=1&n=100",
    );
    expect(inboxHref(parseInboxParams({}))).toBe("/inbox");
    expect(inboxHref(params, { view: "help", q: undefined, item: "x" })).toBe(
      "/inbox?sort=newest&low=1&n=100&item=x",
    );
  });
});

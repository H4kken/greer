import { describe, expect, it } from "vitest";
import type { RawItem } from "@/sources/types";
import { categorize, prefilter } from "./prefilter";

const long =
  "I launched my SaaS a month ago and still have zero paying customers. What should I try next?";
const base: RawItem = {
  externalId: "1",
  type: "story",
  author: "someone",
  title: "Ask HN: zero customers after a month",
  text: long,
  url: "https://news.ycombinator.com/item?id=1",
  threadId: "1",
  createdAt: new Date(),
  raw: {},
};

describe("prefilter", () => {
  it("keeps a substantial post from someone else", () => {
    expect(prefilter(base)).toBe("kept");
  });
  it("drops dead or flagged posts", () => {
    expect(prefilter({ ...base, title: "[dead]" })).toBe("dead");
    expect(prefilter({ ...base, text: "[flagged] something" })).toBe("dead");
  });
  it("drops the user's own posts, case-insensitively", () => {
    expect(prefilter(base, { ownHandle: "SomeOne" })).toBe("own_post");
  });
  it("drops hiring threads", () => {
    expect(
      prefilter({
        ...base,
        type: "comment",
        title: "Ask HN: Who is hiring? (October 2026)",
      }),
    ).toBe("hiring_thread");
  });
  it("drops very short content", () => {
    expect(prefilter({ ...base, type: "comment", text: "+1, same here" })).toBe(
      "too_short",
    );
  });
});

describe("categorize", () => {
  it("puts Show HN launches in feedback and everything else in help", () => {
    expect(categorize({ ...base, title: "Show HN: My tool" })).toBe("feedback");
    expect(
      categorize({ ...base, type: "comment", title: "Show HN: My tool" }),
    ).toBe("help");
    expect(categorize(base)).toBe("help");
  });
});

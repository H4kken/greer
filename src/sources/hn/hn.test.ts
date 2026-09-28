import { describe, expect, it } from "vitest";
import { createHttpClient } from "../http";
import { createHnSource } from "./index";

function fakeFetch(pages: Record<string, unknown>) {
  const calls: URL[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const body = pages[url.searchParams.get("page") ?? url.pathname];
    return new Response(JSON.stringify(body ?? null), { status: 200 });
  }) as typeof fetch;
  const http = createHttpClient({
    fetchImpl,
    minIntervalMs: 0,
    sleep: async () => {},
  });
  return { source: createHnSource(http), calls };
}

const hit = (id: string) => ({
  objectID: id,
  _tags: ["story"],
  author: "a",
  created_at_i: 1_790_000_000,
  title: `Ask HN: ${id}`,
  story_text: "text",
});

describe("HN adapter", () => {
  it("queries Algolia with the section, words and time window, across pages", async () => {
    const { source, calls } = fakeFetch({
      "0": { hits: [hit("1"), hit("2")], nbPages: 2 },
      "1": { hits: [hit("3")], nbPages: 2 },
    });
    const since = new Date("2026-09-20T00:00:00Z");
    const items = await source.fetchNew(
      { query: "first customers", section: "ask_hn" },
      since,
    );

    expect(items.map((i) => i.externalId)).toEqual(["1", "2", "3"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.searchParams.get("tags")).toBe("ask_hn");
    expect(calls[0]!.searchParams.get("query")).toBe("first customers");
    expect(calls[0]!.searchParams.get("numericFilters")).toBe(
      `created_at_i>${since.getTime() / 1000}`,
    );
  });

  it("rejects unknown sections", async () => {
    const { source } = fakeFetch({});
    await expect(
      source.fetchNew({ query: "", section: "nope" }, new Date()),
    ).rejects.toThrow(/Unknown HN section/);
  });

  it("returns null for unknown accounts", async () => {
    const { source } = fakeFetch({});
    expect(await source.fetchAccount!("nobody-here")).toBeNull();
  });

  it("finds a user's comments with an author search", async () => {
    const { source, calls } = fakeFetch({
      "0": {
        hits: [
          {
            objectID: "10",
            _tags: ["comment", "author_mathisg"],
            author: "mathisg",
            created_at_i: 1_790_000_000,
            comment_text: "Try annual plans",
            story_id: 1,
            story_title: "Ask HN: Pricing?",
            parent_id: 5,
          },
        ],
        nbPages: 1,
      },
    });
    const since = new Date("2026-09-01T00:00:00Z");
    const comments = await source.fetchUserComments!("mathisg", since);

    expect(comments).toMatchObject([
      { externalId: "10", parentId: "5", threadId: "1" },
    ]);
    expect(calls[0]!.searchParams.get("tags")).toBe("comment,author_mathisg");
    expect(calls[0]!.searchParams.get("numericFilters")).toBe(
      `created_at_i>${since.getTime() / 1000}`,
    );
  });
});

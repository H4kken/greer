import { describe, expect, it } from "vitest";
import askHn from "./__fixtures__/search-ask-hn.json";
import storyComment from "./__fixtures__/search-story-comment.json";
import thread from "./__fixtures__/thread.json";
import user from "./__fixtures__/firebase-user.json";
import {
  type AlgoliaHit,
  type AlgoliaItem,
  htmlToText,
  itemStatusOf,
  normalizeHit,
  normalizeThreadNode,
  normalizeUser,
} from "./normalize";

describe("HN normalization (recorded responses)", () => {
  it("normalizes comments with their thread's title and id", () => {
    const hit = storyComment.hits[0] as AlgoliaHit;
    const item = normalizeHit(hit);
    expect(item).toMatchObject({
      externalId: hit.objectID,
      type: "comment",
      author: hit.author,
      title: hit.story_title,
      threadId: String(hit.story_id),
      url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    });
    expect(item.createdAt.getTime()).toBe(hit.created_at_i * 1000);
    expect(item.text).not.toMatch(/<[a-z]+[^>]*>/i); // no HTML left
    expect(item.text.length).toBeGreaterThan(0);
  });

  it("normalizes Ask HN stories as their own thread", () => {
    const hit = askHn.hits[0] as AlgoliaHit;
    expect(normalizeHit(hit)).toMatchObject({
      type: "story",
      title: hit.title,
      threadId: hit.objectID,
    });
  });

  it("normalizes a thread tree", () => {
    const root = normalizeThreadNode(thread as unknown as AlgoliaItem);
    expect(root.externalId).toBe("49687256");
    expect(root.children).toHaveLength(3);
    expect(root.children[0]!.text).not.toContain("<p>");
  });

  it("normalizes accounts and item status", () => {
    expect(normalizeUser(user)).toMatchObject({ handle: "pg" });
    expect(normalizeUser(user).createdAt.getUTCFullYear()).toBe(2006);
    expect(itemStatusOf(null)).toBe("missing");
    expect(itemStatusOf({ id: 1, dead: true })).toBe("dead");
    expect(itemStatusOf({ id: 1, deleted: true })).toBe("deleted");
    expect(itemStatusOf({ id: 1 })).toBe("live");
  });

  it("converts HN's HTML to plain text", () => {
    expect(
      htmlToText(
        'It&#x27;s <i>fine</i><p>See <a href="https:&#x2F;&#x2F;x.com">x.com</a> &amp; more',
      ),
    ).toBe("It's fine\n\nSee x.com & more");
  });
});

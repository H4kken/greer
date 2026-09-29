import { describe, expect, it } from "vitest";
import askHn from "./__fixtures__/search-ask-hn.json";
import storyComment from "./__fixtures__/search-story-comment.json";
import thread from "./__fixtures__/thread.json";
import user from "./__fixtures__/firebase-user.json";
import userComments from "./__fixtures__/search-user-comments.json";
import {
  type AlgoliaHit,
  type AlgoliaItem,
  htmlToText,
  itemStatusOf,
  normalizeHit,
  normalizeThreadNode,
  normalizeUser,
  normalizeUserComment,
} from "./normalize";

describe("HN normalization (recorded responses)", () => {
  it("normalizes the user's own comments with what they answer", () => {
    const hit = userComments.hits[0] as AlgoliaHit;
    expect(normalizeUserComment(hit)).toMatchObject({
      externalId: "49875167",
      parentId: "49875023",
      threadId: "49843909",
      threadTitle: hit.story_title,
      text: "Not sure what happened there! Fixed now.",
      url: "https://news.ycombinator.com/item?id=49875167",
      createdAt: new Date(1790584655 * 1000),
    });
    // HTML becomes plain text.
    expect(
      normalizeUserComment(userComments.hits[1] as AlgoliaHit).text,
    ).toMatch(/^Could you please stop posting unsubstantive comments/);
  });

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
    ).toBe("It's fine\n\nSee https://x.com & more");
  });

  it("keeps a link's full address, not HN's shortened text", () => {
    expect(
      htmlToText(
        'Docs: <a href="https:&#x2F;&#x2F;example.com&#x2F;docs&#x2F;getting-started?ref=hn&amp;x=1" rel="nofollow">https:&#x2F;&#x2F;example.com&#x2F;docs&#x2F;gett...</a>.',
      ),
    ).toBe("Docs: https://example.com/docs/getting-started?ref=hn&x=1.");
  });
});

// Pure conversions from HN API payloads to Greer's types.
import type {
  AccountProfile,
  ItemStatus,
  RawItem,
  ThreadActivity,
  ThreadNode,
  UserComment,
} from "../types";

export const HN_ITEM_URL = "https://news.ycombinator.com/item?id=";

export type AlgoliaHit = {
  objectID: string;
  _tags: string[];
  author: string;
  created_at_i: number;
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  story_id?: number | null;
  parent_id?: number | null;
};

export type AlgoliaItem = {
  id: number;
  type: string;
  author: string | null;
  created_at_i: number;
  title?: string | null;
  text?: string | null;
  story_id?: number | null;
  children: AlgoliaItem[];
};

export type FirebaseUser = { id: string; created: number; karma: number };
export type FirebaseItem = {
  id: number;
  by?: string;
  dead?: boolean;
  deleted?: boolean;
};

// HN text is HTML with a small set of tags and entities. HN links bare
// URLs itself and shortens long ones in the link text ("https://x.com/a/
// very/lo..."), so a link becomes its full address.
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/gi, "$1")
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .trim();
}

export function normalizeHit(hit: AlgoliaHit): RawItem {
  const isComment = hit._tags.includes("comment");
  return {
    externalId: hit.objectID,
    type: isComment ? "comment" : "story",
    author: hit.author,
    title: (isComment ? hit.story_title : hit.title) ?? "",
    text: htmlToText(isComment ? hit.comment_text : hit.story_text),
    url: HN_ITEM_URL + hit.objectID,
    threadId: String(hit.story_id ?? hit.objectID),
    createdAt: new Date(hit.created_at_i * 1000),
    raw: hit,
  };
}

// A comment hit from an author search (tags=comment,author_<handle>).
export function normalizeUserComment(hit: AlgoliaHit): UserComment {
  const threadId = String(hit.story_id ?? hit.objectID);
  return {
    externalId: hit.objectID,
    parentId: String(hit.parent_id ?? threadId),
    threadId,
    threadTitle: hit.story_title ?? "",
    text: htmlToText(hit.comment_text),
    url: HN_ITEM_URL + hit.objectID,
    createdAt: new Date(hit.created_at_i * 1000),
    raw: hit,
  };
}

export function normalizeThreadNode(item: AlgoliaItem): ThreadNode {
  return {
    externalId: String(item.id),
    author: item.author,
    text: htmlToText(item.text),
    createdAt: new Date(item.created_at_i * 1000),
    children: (item.children ?? []).map(normalizeThreadNode),
  };
}

export function normalizeUser(user: FirebaseUser): AccountProfile {
  return {
    handle: user.id,
    createdAt: new Date(user.created * 1000),
    karma: user.karma,
  };
}

export function itemStatusOf(item: FirebaseItem | null): ItemStatus {
  if (!item) return "missing";
  if (item.deleted) return "deleted";
  if (item.dead) return "dead";
  return "live";
}

// How a thread is going around one item, from its newest comments (one
// Algolia page) and the thread's comment count. Replies to the item are
// counted among those comments: enough to tell "none yet" from "plenty".
export function activityOf(
  page: { nbHits: number; hits: AlgoliaHit[] },
  item: { externalId: string; author: string },
): ThreadActivity {
  const author = item.author.toLowerCase();
  let authorAt = 0;
  let replies = 0;
  for (const hit of page.hits) {
    if (String(hit.parent_id) === item.externalId) replies++;
    if (
      hit.objectID !== item.externalId &&
      hit.author?.toLowerCase() === author
    ) {
      authorAt = Math.max(authorAt, hit.created_at_i);
    }
  }
  return {
    comments: page.nbHits,
    repliesToItem: replies,
    authorActiveAt: authorAt ? new Date(authorAt * 1000) : null,
  };
}

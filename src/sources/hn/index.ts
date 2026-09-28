import { createHttpClient, type HttpClient } from "../http";
import type { Source, SourceQuery } from "../types";
import {
  type AlgoliaHit,
  type AlgoliaItem,
  type FirebaseItem,
  type FirebaseUser,
  HN_ITEM_URL,
  itemStatusOf,
  normalizeHit,
  normalizeThreadNode,
  normalizeUser,
  normalizeUserComment,
} from "./normalize";

const ALGOLIA = "https://hn.algolia.com/api/v1";
const FIREBASE = "https://hacker-news.firebaseio.com/v0";

export const HN_SECTIONS = {
  story_comment: "(story,comment)",
  story: "story",
  ask_hn: "ask_hn",
  show_hn: "show_hn",
} as const;
export type HnSection = keyof typeof HN_SECTIONS;

const HITS_PER_PAGE = 100;
const MAX_PAGES = 5; // 500 results per query per poll is plenty

// Algolia's newest-first search, following result pages up to MAX_PAGES.
async function searchByDate(
  http: HttpClient,
  tags: string,
  since: Date,
  query = "",
): Promise<AlgoliaHit[]> {
  const hits: AlgoliaHit[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      tags,
      numericFilters: `created_at_i>${Math.floor(since.getTime() / 1000)}`,
      hitsPerPage: String(HITS_PER_PAGE),
      page: String(page),
    });
    if (query) params.set("query", query);
    const data = await http.getJson<{ hits: AlgoliaHit[]; nbPages: number }>(
      `${ALGOLIA}/search_by_date?${params}`,
    );
    hits.push(...data.hits);
    if (page + 1 >= data.nbPages) break;
  }
  return hits;
}

export function createHnSource(http: HttpClient = createHttpClient()): Source {
  return {
    platform: "hn",

    async fetchNew(query: SourceQuery, since: Date) {
      const tags = HN_SECTIONS[query.section as HnSection];
      if (!tags) throw new Error(`Unknown HN section "${query.section}"`);
      const hits = await searchByDate(http, tags, since, query.query);
      return hits.map(normalizeHit);
    },

    async fetchUserComments(handle: string, since: Date) {
      const hits = await searchByDate(http, `comment,author_${handle}`, since);
      return hits.map(normalizeUserComment);
    },

    async fetchThread(externalId: string) {
      const item = await http.getJson<AlgoliaItem>(
        `${ALGOLIA}/items/${externalId}`,
      );
      return {
        externalId: String(item.id),
        title: item.title ?? "",
        url: HN_ITEM_URL + item.id,
        root: normalizeThreadNode(item),
      };
    },

    permalink: (externalId: string) => HN_ITEM_URL + externalId,

    async fetchAccount(handle: string) {
      const user = await http.getJson<FirebaseUser | null>(
        `${FIREBASE}/user/${encodeURIComponent(handle)}.json`,
      );
      return user ? normalizeUser(user) : null;
    },

    async itemStatus(externalId: string) {
      return itemStatusOf(
        await http.getJson<FirebaseItem | null>(
          `${FIREBASE}/item/${externalId}.json`,
        ),
      );
    },
  };
}

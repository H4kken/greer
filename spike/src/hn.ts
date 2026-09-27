// Hacker News access through the official Algolia search API (free, no key).
import type { Query } from './config.ts';

const ALGOLIA = 'https://hn.algolia.com/api/v1';
const USER_AGENT = 'greer-spike/0.1 (+https://github.com/; open-source community tool)';

export type Item = {
  id: string;
  type: 'story' | 'comment';
  author: string;
  createdAt: string;
  title: string; // story title, or the parent story's title for comments
  text: string; // plain text body (story text or comment)
  url: string; // HN permalink
  storyId: string;
  points: number | null;
  queries: string[]; // which queries matched it
};

type AlgoliaHit = {
  objectID: string;
  _tags: string[];
  author: string;
  created_at: string;
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  story_id?: number | null;
  points?: number | null;
};

export type ThreadNode = {
  id: number;
  author: string | null;
  text: string | null;
  title?: string | null;
  children: ThreadNode[];
};

export function toPlainText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .trim();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HN API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function searchQuery(q: Query, days: number, maxPerQuery: number): Promise<Item[]> {
  const since = Math.floor(Date.now() / 1000) - (q.days ?? days) * 86400;
  const items: Item[] = [];
  for (let page = 0; items.length < maxPerQuery; page++) {
    const params = new URLSearchParams({
      tags: q.tags,
      numericFilters: `created_at_i>${since}`,
      hitsPerPage: String(Math.min(100, maxPerQuery)),
      page: String(page),
    });
    if (q.query) params.set('query', q.query);
    const data = await getJson<{ hits: AlgoliaHit[]; nbPages: number }>(`${ALGOLIA}/search_by_date?${params}`);
    for (const h of data.hits) {
      const isComment = h._tags.includes('comment');
      items.push({
        id: h.objectID,
        type: isComment ? 'comment' : 'story',
        author: h.author,
        createdAt: h.created_at,
        title: (isComment ? h.story_title : h.title) ?? '',
        text: toPlainText(isComment ? h.comment_text : h.story_text),
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        storyId: String(h.story_id ?? h.objectID),
        points: h.points ?? null,
        queries: [q.label],
      });
    }
    if (page + 1 >= data.nbPages) break;
    await sleep(200); // be polite even though the limits are generous
  }
  return items.slice(0, maxPerQuery);
}

export async function fetchThread(storyId: string): Promise<ThreadNode> {
  return getJson<ThreadNode>(`${ALGOLIA}/items/${storyId}`);
}

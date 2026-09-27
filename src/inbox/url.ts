// Inbox state lives in the URL, so views are shareable and survive reloads.
import { INBOX_VIEWS, type InboxSort, type InboxView } from "./queries";

export const PAGE_SIZE = 50;
const MAX_LIMIT = 500;

export type InboxParams = {
  view: InboxView;
  sort: InboxSort;
  q?: string; // keyword (source query id)
  low: boolean; // include lower matches
  n: number; // how many items to show
  item?: string; // selected item id
};

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export function parseInboxParams(raw: Raw): InboxParams {
  const view = first(raw.view);
  const n = Number(first(raw.n));
  return {
    view: INBOX_VIEWS.includes(view as InboxView)
      ? (view as InboxView)
      : "help",
    sort: first(raw.sort) === "newest" ? "newest" : "best",
    q: first(raw.q) || undefined,
    low: first(raw.low) === "1",
    n: Number.isInteger(n) && n > 0 ? Math.min(n, MAX_LIMIT) : PAGE_SIZE,
    item: first(raw.item) || undefined,
  };
}

// Only non-default values go in the URL.
export function inboxHref(
  params: InboxParams,
  changes: Partial<InboxParams> = {},
): string {
  const p = { ...params, ...changes };
  const search = new URLSearchParams();
  if (p.view !== "help") search.set("view", p.view);
  if (p.sort !== "best") search.set("sort", p.sort);
  if (p.q) search.set("q", p.q);
  if (p.low) search.set("low", "1");
  if (p.n !== PAGE_SIZE) search.set("n", String(p.n));
  if (p.item) search.set("item", p.item);
  const qs = search.toString();
  return qs ? `/inbox?${qs}` : "/inbox";
}

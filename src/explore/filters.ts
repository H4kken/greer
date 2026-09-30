// Explore's filters, read from and written to the URL, so a search can be
// reloaded, shared and used without JavaScript. Pure.

export const EXPLORE_KINDS = ["all", "help", "launches"] as const;
export const EXPLORE_SORTS = ["best", "new"] as const;
export const EXPLORE_DAYS = [3, 7, 30] as const;
export const EXPLORE_PAGE = 30;

export type ExploreFilters = {
  q: string;
  kind: (typeof EXPLORE_KINDS)[number];
  sort: (typeof EXPLORE_SORTS)[number];
  days: (typeof EXPLORE_DAYS)[number];
  // Also threads that don't match one of the builder's problems, or score
  // under Today's bar.
  weaker: boolean;
  page: number;
};

export const DEFAULT_FILTERS: ExploreFilters = {
  q: "",
  kind: "all",
  sort: "best",
  days: 7,
  weaker: false,
  page: 1,
};

// Search params as they come from the URL, made safe: anything unknown falls
// back to the default.
export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): ExploreFilters {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const pick = <T extends string | number>(
    list: readonly T[],
    raw: string | undefined,
    fallback: T,
  ): T => list.find((x) => String(x) === raw) ?? fallback;
  const page = Number.parseInt(one("page") ?? "", 10);
  return {
    q: (one("q") ?? "").trim().slice(0, 100),
    kind: pick(EXPLORE_KINDS, one("kind"), DEFAULT_FILTERS.kind),
    sort: pick(EXPLORE_SORTS, one("sort"), DEFAULT_FILTERS.sort),
    days: pick(EXPLORE_DAYS, one("days"), DEFAULT_FILTERS.days),
    weaker: one("weaker") === "1",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 100) : 1,
  };
}

// The URL for these filters with some changed; defaults are left out. Any
// change other than the page goes back to page 1.
export function exploreHref(
  filters: ExploreFilters,
  change: Partial<ExploreFilters> = {},
): string {
  const next = {
    ...filters,
    ...change,
    page: "page" in change ? change.page! : 1,
  };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.kind !== DEFAULT_FILTERS.kind) params.set("kind", next.kind);
  if (next.sort !== DEFAULT_FILTERS.sort) params.set("sort", next.sort);
  if (next.days !== DEFAULT_FILTERS.days) params.set("days", String(next.days));
  if (next.weaker) params.set("weaker", "1");
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/explore?${query}` : "/explore";
}

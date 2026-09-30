import { SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ExploreList,
  type ExploreRowView,
} from "@/components/explore/explore-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import {
  EXPLORE_DAYS,
  EXPLORE_PAGE,
  exploreHref,
  type ExploreFilters,
  parseFilters,
} from "@/explore/filters";
import { type ExploreRow, loadExplore } from "@/explore/queries";
import { requireWorkspace } from "@/lib/session";
import { formatAbsolute, formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { fitLine, seedOf } from "@/scoring/explain";
import { activityLine, matchLabel, threadTag, topicOf } from "@/today/present";
import { getAccountSummary } from "@/workspace/accounts";
import { getProductProfile } from "@/workspace/profile";

export const metadata: Metadata = { title: "Explore · Greer" };

const KIND_LABELS: Record<ExploreFilters["kind"], string> = {
  all: "Everything",
  help: "Asking for help",
  launches: "Launches",
};

export default async function ExplorePage({
  searchParams,
}: PageProps<"/explore">) {
  const filters = parseFilters(await searchParams);
  const { workspace } = await requireWorkspace();
  const now = new Date();
  const [account, profile] = await Promise.all([
    getAccountSummary(db, workspace.id, "hn"),
    getProductProfile(db, workspace.id),
  ]);
  const { rows, total } = await loadExplore(db, workspace.id, {
    platform: "hn",
    me: account?.handle ?? null,
    filters,
    now,
  });
  const problems = profile?.problems ?? [];

  const view = (r: ExploreRow): ExploreRowView => {
    const comment = r.type === "comment" && !!r.text;
    const title = r.title || "(untitled)";
    return {
      id: r.id,
      url: r.url,
      tag: r.category === "feedback" ? "Show HN" : threadTag(r),
      topic: comment ? r.text : topicOf(title),
      topicQuote: comment,
      context: comment ? `in “${topicOf(title)}”` : null,
      handle: r.author,
      when: formatRelative(r.postedAt, now),
      whenTitle: formatAbsolute(r.postedAt),
      fit:
        r.category === "help"
          ? (fitLine(r.category, r.criteria, problems) ?? matchLabel(r.score))
          : null,
      seed: seedOf(r.category, r.criteria),
      launch: r.category === "feedback",
      activity: activityLine({ ...r, checkedAt: r.activityCheckedAt }, now),
      replied: r.triageStatus === "replied",
    };
  };

  const pages = Math.ceil(total / EXPLORE_PAGE);
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm whitespace-nowrap no-underline",
      active
        ? "border-primary bg-primary-soft text-primary-soft-foreground"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-medium tracking-tight">Explore</h1>
        <p className="text-muted-foreground">
          Everything Greer found on Hacker News, for browsing. Today picks who
          to talk to; here you can look around at your own pace.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <form
          action="/explore"
          method="get"
          role="search"
          className="flex gap-2"
        >
          {filters.kind !== "all" && (
            <input type="hidden" name="kind" value={filters.kind} />
          )}
          {filters.sort !== "best" && (
            <input type="hidden" name="sort" value={filters.sort} />
          )}
          {filters.days !== 7 && (
            <input type="hidden" name="days" value={filters.days} />
          )}
          {filters.weaker && <input type="hidden" name="weaker" value="1" />}
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search titles and text"
            aria-label="Search threads"
            className="flex-1"
          />
          <Button type="submit" variant="outline">
            <SearchIcon aria-hidden /> Search
          </Button>
        </form>

        <nav aria-label="Filters" className="flex flex-col gap-2">
          <ul className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABELS) as ExploreFilters["kind"][]).map((k) => (
              <li key={k}>
                <Link
                  href={exploreHref(filters, { kind: k })}
                  aria-current={filters.kind === k ? "true" : undefined}
                  className={chip(filters.kind === k)}
                >
                  {KIND_LABELS[k]}
                </Link>
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              Sort:{" "}
              {(["best", "new"] as const).map((s, i) => (
                <span key={s}>
                  {i > 0 && " · "}
                  <Link
                    href={exploreHref(filters, { sort: s })}
                    aria-current={filters.sort === s ? "true" : undefined}
                    className={cn(
                      filters.sort === s
                        ? "font-medium text-foreground no-underline"
                        : "text-muted-foreground",
                    )}
                  >
                    {s === "best" ? "best match" : "newest"}
                  </Link>
                </span>
              ))}
            </span>
            <span>
              Last:{" "}
              {EXPLORE_DAYS.map((d, i) => (
                <span key={d}>
                  {i > 0 && " · "}
                  <Link
                    href={exploreHref(filters, { days: d })}
                    aria-current={filters.days === d ? "true" : undefined}
                    className={cn(
                      filters.days === d
                        ? "font-medium text-foreground no-underline"
                        : "text-muted-foreground",
                    )}
                  >
                    {d} days
                  </Link>
                </span>
              ))}
            </span>
            <Link
              href={exploreHref(filters, { weaker: !filters.weaker })}
              className="text-muted-foreground"
            >
              {filters.weaker ? "Only good matches" : "Include weaker matches"}
            </Link>
          </p>
        </nav>
      </div>

      {rows.length ? (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {total} {total === 1 ? "thread" : "threads"}
            {pages > 1 && ` · page ${filters.page} of ${pages}`}
          </p>
          <ExploreList rows={rows.map(view)} />
          {pages > 1 && (
            <nav
              aria-label="Pages"
              className="flex items-center justify-between text-sm"
            >
              {filters.page > 1 ? (
                <Link href={exploreHref(filters, { page: filters.page - 1 })}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              {filters.page < pages && (
                <Link href={exploreHref(filters, { page: filters.page + 1 })}>
                  Next
                </Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
          <h2 className="text-xl font-medium">Nothing here</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {filters.q
              ? `No thread mentions “${filters.q}” in the last ${filters.days} days.`
              : `No threads in the last ${filters.days} days yet.`}{" "}
            {!filters.weaker && (
              <Link href={exploreHref(filters, { weaker: true })}>
                Include weaker matches
              </Link>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

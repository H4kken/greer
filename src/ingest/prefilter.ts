// Cheap, deterministic checks that run before any LLM call. Filtered items are
// still stored (with their status) so the funnel counts stay honest.
import type { RawItem } from "@/sources/types";

export type FilterStatus =
  "kept" | "too_short" | "hiring_thread" | "dead" | "own_post";

export type Category = "help" | "feedback";

export const MIN_CHARS = 80;
const DEAD = /^\[(dead|flagged|deleted)\]/i;
const HIRING_THREAD =
  /who is hiring|who wants to be hired|freelancer\? seeking freelancer/i;
const SHOW_HN = /^show hn\b/i;

export function prefilter(
  item: RawItem,
  ctx: { ownHandle?: string | null } = {},
): FilterStatus {
  if (DEAD.test(item.title) || DEAD.test(item.text)) return "dead";
  if (
    ctx.ownHandle &&
    item.author.toLowerCase() === ctx.ownHandle.toLowerCase()
  )
    return "own_post";
  if (HIRING_THREAD.test(item.title)) return "hiring_thread";
  const content =
    `${item.type === "story" ? item.title : ""} ${item.text}`.trim();
  if (content.length < MIN_CHARS) return "too_short";
  return "kept";
}

// Launch posts go to the "Feedback · Show HN" tab; everything else is "help".
export function categorize(item: RawItem): Category {
  return item.type === "story" && SHOW_HN.test(item.title)
    ? "feedback"
    : "help";
}

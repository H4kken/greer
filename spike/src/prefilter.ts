// Cheap, deterministic filtering before any LLM call.
import type { Item } from "./hn.ts";

const SKIP_THREADS =
  /who is hiring|who wants to be hired|freelancer\? seeking freelancer/i;
const DEAD = /^\[(dead|flagged|deleted)\]/i;
const MIN_CHARS = 80;

export type FilterStats = {
  fetched: number;
  unique: number;
  tooShort: number;
  skippedThread: number;
  dead: number;
  kept: number;
};

export function prefilter(batches: Item[][]): {
  items: Item[];
  stats: FilterStats;
} {
  const byId = new Map<string, Item>();
  let fetched = 0;
  for (const batch of batches) {
    for (const item of batch) {
      fetched++;
      const existing = byId.get(item.id);
      if (existing)
        existing.queries.push(
          ...item.queries.filter((q) => !existing.queries.includes(q)),
        );
      else byId.set(item.id, item);
    }
  }

  let tooShort = 0;
  let skippedThread = 0;
  let dead = 0;
  const kept: Item[] = [];
  for (const item of byId.values()) {
    const content =
      `${item.type === "story" ? item.title : ""} ${item.text}`.trim();
    if (DEAD.test(item.title) || DEAD.test(item.text)) dead++;
    else if (SKIP_THREADS.test(item.title)) skippedThread++;
    else if (content.length < MIN_CHARS) tooShort++;
    else kept.push(item);
  }

  return {
    items: kept,
    stats: {
      fetched,
      unique: byId.size,
      tooShort,
      skippedThread,
      dead,
      kept: kept.length,
    },
  };
}

// Round-robin across queries so one noisy query can't eat the whole scoring budget.
export function capFairly(items: Item[], max: number): Item[] {
  const buckets = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.queries[0]!;
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  const lists = [...buckets.values()];
  const out: Item[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      if (out.length >= max) break;
      if (i < list.length) out.push(list[i]!);
    }
  }
  return out;
}

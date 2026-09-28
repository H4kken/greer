// What the first-scan page says, from the progress numbers. Pure, so every
// state (searching, reading, done, waiting for an AI model) is unit-tested.

export type ScanProgress = {
  queries: { total: number; finished: number; failed: number };
  found: number;
  kept: number;
  scored: number;
  // Distinct authors of threads worth your time: one person with a post and a
  // comment counts once.
  people: number;
  // The best threads worth your time (score >= MIN_SCORE), best first.
  top: {
    id: string;
    title: string;
    url: string;
    category: "help" | "feedback";
    score: number;
    criteriaMet: number;
    criteriaTotal: number;
    reason: string;
  }[];
};

// Done when every query ran once and every kept item has a score.
export function scanDone(p: ScanProgress): boolean {
  return (
    p.queries.total > 0 &&
    p.queries.finished >= p.queries.total &&
    p.scored >= p.kept
  );
}

// Share of the bar for the search phase; reading and scoring fill the rest.
export const SEARCH_SHARE = 0.15;

export type ScanCopy = {
  done: boolean;
  // Searches can run without a model, but nothing gets read until one is set.
  needsModel: boolean;
  ratio: number;
  progressLabel: string;
  headline: string;
  subline: string;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function describeScan(
  p: ScanProgress,
  { modelConfigured }: { modelConfigured: boolean },
): ScanCopy {
  const done = scanDone(p);
  const needsModel = !modelConfigured && !done;
  const searching = p.queries.finished < p.queries.total;
  const who = p.people === 1 ? "person" : "people";

  const ratio = done
    ? 1
    : searching
      ? SEARCH_SHARE * (p.queries.finished / Math.max(1, p.queries.total))
      : SEARCH_SHARE + (1 - SEARCH_SHARE) * (p.scored / Math.max(1, p.kept));
  const progressLabel = done
    ? "Done"
    : searching
      ? `${p.queries.finished} of ${p.queries.total} searches done`
      : needsModel
        ? "Waiting for an AI model"
        : `${p.scored} of ${p.kept} read`;

  if (needsModel) {
    return {
      done,
      needsModel,
      ratio,
      progressLabel,
      headline:
        searching || p.kept === 0
          ? "Searching the last 7 days of Hacker News"
          : `Found ${plural(p.kept, "thread", "threads")} to read`,
      subline:
        "Connect an AI model below so Greer can read them and find the people you could help.",
    };
  }

  return {
    done,
    needsModel,
    ratio,
    progressLabel,
    headline: !done
      ? "Reading the last 7 days of Hacker News"
      : p.people > 0
        ? `${p.people} ${who} you could help today`
        : "No one to help just yet",
    subline: !done
      ? p.people > 0
        ? `Found ${p.people} ${who} you could help so far.`
        : "Looking for people you can genuinely help."
      : p.people > 0
        ? "Start with these. Take your time: a thoughtful reply beats a fast one."
        : "Nothing from the last 7 days matched well. Greer keeps looking every 15 minutes.",
  };
}

// Metrics for prompt evals (scripts/eval.ts). Pure, unit-tested.

export type EvalOutcome = {
  expected: "yes" | "no" | "maybe";
  score: number;
};

// Ranking quality without a threshold: the share of (yes, no) pairs where
// the yes scores higher (ties count half). 1 is perfect, 0.5 is chance.
export function rankAuc(outcomes: EvalOutcome[]): number | null {
  const yes = outcomes.filter((o) => o.expected === "yes");
  const no = outcomes.filter((o) => o.expected === "no");
  if (!yes.length || !no.length) return null;
  let wins = 0;
  for (const y of yes)
    for (const n of no)
      wins += y.score > n.score ? 1 : y.score === n.score ? 0.5 : 0;
  return wins / (yes.length * no.length);
}

export function evalMetrics(outcomes: EvalOutcome[], threshold: number) {
  const labeled = outcomes.filter((o) => o.expected !== "maybe");
  const tp = labeled.filter(
    (o) => o.expected === "yes" && o.score >= threshold,
  ).length;
  const fp = labeled.filter(
    (o) => o.expected === "no" && o.score >= threshold,
  ).length;
  const fn = labeled.filter(
    (o) => o.expected === "yes" && o.score < threshold,
  ).length;
  const top10 = [...outcomes].sort((a, b) => b.score - a.score).slice(0, 10);
  return {
    threshold,
    precision: tp + fp === 0 ? null : tp / (tp + fp),
    recall: tp + fn === 0 ? null : tp / (tp + fn),
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    distinctScores: new Set(outcomes.map((o) => o.score)).size,
    // How many of the top 10 share their score with another top-10 item.
    tiedInTop10: top10.filter(
      (o, _, all) => all.filter((x) => x.score === o.score).length > 1,
    ).length,
  };
}

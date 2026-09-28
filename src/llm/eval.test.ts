import { describe, expect, it } from "vitest";
import { evalMetrics, rankAuc } from "./eval";

describe("evalMetrics", () => {
  it("computes precision/recall at a threshold, ignoring maybes", () => {
    const m = evalMetrics(
      [
        { expected: "yes", score: 90 },
        { expected: "yes", score: 40 },
        { expected: "no", score: 70 },
        { expected: "no", score: 10 },
        { expected: "maybe", score: 95 },
      ],
      60,
    );
    expect(m).toMatchObject({
      precision: 0.5,
      recall: 0.5,
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
    });
  });

  it("counts ties among the top scores", () => {
    const m = evalMetrics(
      [75, 75, 75, 90, 20].map((score) => ({ expected: "no" as const, score })),
      60,
    );
    expect(m.tiedInTop10).toBe(3);
    expect(m.distinctScores).toBe(3);
  });
});

describe("rankAuc", () => {
  it("is the share of yes/no pairs ranked the right way, ties half", () => {
    const auc = rankAuc([
      { expected: "yes", score: 90 },
      { expected: "yes", score: 50 },
      { expected: "no", score: 50 },
      { expected: "no", score: 10 },
      { expected: "maybe", score: 100 },
    ]);
    // 90>50, 90>10, 50=50 (half), 50>10: 3.5 of 4 pairs.
    expect(auc).toBe(0.875);
  });

  it("is null without both labels", () => {
    expect(rankAuc([{ expected: "yes", score: 1 }])).toBeNull();
  });
});

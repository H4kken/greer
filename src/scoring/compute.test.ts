import { describe, expect, it } from "vitest";
import type { ScoreHelpOutput } from "@/llm/prompts/score-help";
import { computeHelpScore, computeLaunchScore } from "./compute";

const help = (over: Partial<ScoreHelpOutput> = {}): ScoreHelpOutput => ({
  own_situation: true,
  seeking_help: true,
  problem_match: "strong",
  matched_problem: 1,
  specific: true,
  reply_welcome: true,
  intent: "asking_for_help",
  reason: "r",
  ...over,
});

describe("computeHelpScore", () => {
  it("gives 100 with every criterion at its best, 0 with none", () => {
    expect(computeHelpScore(help())).toEqual({
      score: 100,
      criteriaMet: 5,
      criteriaTotal: 5,
    });
    expect(
      computeHelpScore(
        help({
          own_situation: false,
          seeking_help: false,
          problem_match: "none",
          specific: false,
          reply_welcome: false,
        }),
      ),
    ).toEqual({ score: 0, criteriaMet: 0, criteriaTotal: 5 });
  });

  it("separates match strengths and specificity, so good threads don't all tie", () => {
    const scores = (["weak", "clear", "strong"] as const).map(
      (m) => computeHelpScore(help({ problem_match: m })).score,
    );
    expect(new Set(scores).size).toBe(3);
    expect(computeHelpScore(help({ specific: false })).score).toBe(80);
  });

  it("caps threads where nobody asks for help or describes a struggle", () => {
    expect(
      computeHelpScore(help({ seeking_help: false, intent: "sharing_launch" }))
        .score,
    ).toBe(40);
    expect(
      computeHelpScore(help({ seeking_help: false, intent: "describing_pain" }))
        .score,
    ).toBe(80);
  });
});

describe("computeLaunchScore", () => {
  const all = {
    asks_for_feedback: true,
    early_stage: true,
    maker_in_audience: true,
    useful_feedback_possible: true,
    reason: "r",
  };

  it("counts criteria and weights feedback requests and audience fit most", () => {
    expect(computeLaunchScore(all)).toEqual({
      score: 100,
      criteriaMet: 4,
      criteriaTotal: 4,
    });
    expect(computeLaunchScore({ ...all, asks_for_feedback: false }).score).toBe(
      70,
    );
  });

  it("caps launches from makers outside the builder's audience", () => {
    expect(computeLaunchScore({ ...all, maker_in_audience: false }).score).toBe(
      40,
    );
  });
});

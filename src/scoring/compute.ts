// Turns the model's criteria into a 0–100 score. Pure and deterministic, so
// weights can change without re-asking the model.
import type { ScoreHelpOutput } from "@/llm/prompts/score-help";
import type { ScoreLaunchOutput } from "@/llm/prompts/score-launch";

export type ComputedScore = {
  score: number;
  criteriaMet: number;
  criteriaTotal: number;
};

const PROBLEM_MATCH_POINTS = { none: 0, weak: 10, clear: 20, strong: 30 };

// Some answers mean "not a target", whatever the other criteria say.
const CAP = 40;

export function computeHelpScore(c: ScoreHelpOutput): ComputedScore {
  const met = [
    c.own_situation,
    c.seeking_help,
    c.problem_match !== "none",
    c.specific,
    c.reply_welcome,
  ];
  const raw =
    (c.own_situation ? 20 : 0) +
    (c.seeking_help ? 20 : 0) +
    PROBLEM_MATCH_POINTS[c.problem_match] +
    (c.specific ? 20 : 0) +
    (c.reply_welcome ? 10 : 0);
  // Neither asking for help nor describing a struggle: not someone to help.
  const target = c.seeking_help || c.intent === "describing_pain";
  return {
    score: target ? raw : Math.min(raw, CAP),
    criteriaMet: met.filter(Boolean).length,
    criteriaTotal: met.length,
  };
}

export function computeLaunchScore(c: ScoreLaunchOutput): ComputedScore {
  const met = [
    c.asks_for_feedback,
    c.early_stage,
    c.maker_in_audience,
    c.useful_feedback_possible,
  ];
  const raw =
    (c.asks_for_feedback ? 30 : 0) +
    (c.early_stage ? 20 : 0) +
    (c.maker_in_audience ? 30 : 0) +
    (c.useful_feedback_possible ? 20 : 0);
  return {
    // Outside the builder's audience: feedback there doesn't build a community.
    score: c.maker_in_audience ? raw : Math.min(raw, CAP),
    criteriaMet: met.filter(Boolean).length,
    criteriaTotal: met.length,
  };
}

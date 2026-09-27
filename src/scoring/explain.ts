// Turns stored criteria into plain lines for "Why Greer surfaced this".
// Criteria are the model's answers as stored in item_score.criteria; older
// prompt versions may lack fields, so everything is optional here.
import { z } from "zod";

export type CriterionLine = { label: string; met: boolean };

const helpCriteria = z
  .object({
    own_situation: z.boolean(),
    seeking_help: z.boolean(),
    problem_match: z.enum(["none", "weak", "clear", "strong"]),
    matched_problem: z.number().nullable(),
    specific: z.boolean(),
    reply_welcome: z.boolean(),
  })
  .partial();

const launchCriteria = z
  .object({
    asks_for_feedback: z.boolean(),
    early_stage: z.boolean(),
    maker_in_audience: z.boolean(),
    useful_feedback_possible: z.boolean(),
  })
  .partial();

const MATCH_WORDS = {
  weak: "Loosely matches",
  clear: "Matches",
  strong: "Strongly matches",
};

export function explainCriteria(
  category: "help" | "feedback",
  criteria: unknown,
  problems: string[],
): CriterionLine[] {
  const lines: CriterionLine[] = [];
  const add = (value: boolean | undefined, yes: string, no: string) => {
    if (value !== undefined)
      lines.push({ label: value ? yes : no, met: value });
  };

  if (category === "feedback") {
    const c = launchCriteria.safeParse(criteria).data ?? {};
    add(c.asks_for_feedback, "Asks for feedback", "Doesn't ask for feedback");
    add(c.early_stage, "Early-stage product", "Not an early-stage product");
    add(
      c.maker_in_audience,
      "The maker is in your audience",
      "The maker isn't in your audience",
    );
    add(
      c.useful_feedback_possible,
      "You can give useful feedback",
      "Hard to give useful feedback",
    );
    return lines;
  }

  const c = helpCriteria.safeParse(criteria).data ?? {};
  add(
    c.own_situation,
    "Talks about their own situation",
    "Not about their own situation",
  );
  add(c.seeking_help, "Asks for help or feedback", "Doesn't ask for help");
  if (c.problem_match) {
    const problem =
      c.matched_problem != null ? problems[c.matched_problem - 1] : undefined;
    lines.push(
      c.problem_match === "none"
        ? { label: "No match with your problems", met: false }
        : {
            label: `${MATCH_WORDS[c.problem_match]}${problem ? `: ${problem}` : " one of your problems"}`,
            met: true,
          },
    );
  }
  add(c.specific, "Gives concrete details", "Few concrete details");
  add(
    c.reply_welcome,
    "A reply would be welcome",
    "A reply may not be welcome",
  );
  return lines;
}

const INTENT_LABELS: Record<string, string> = {
  asking_for_help: "Asking for help",
  describing_pain: "Describing a problem",
  sharing_launch: "Launch",
  discussion: "Discussion",
  other: "Other",
};

export function intentLabel(intent: string): string {
  return INTENT_LABELS[intent] ?? intent;
}

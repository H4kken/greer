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
    author_in_audience: z.boolean(),
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
  add(c.author_in_audience, "One of your audience", "Not one of your audience");
  return lines;
}

// Two kinds of conversation worth having. A carrot is someone who could
// become a user: one of your audience, facing one of your problems
// themselves; a 1:1 conversation, worth following up. A dandelion is help
// in public: the thread's readers are the audience. Null for scores made
// before the question existed.
export type Seed = "carrot" | "dandelion";

export function seedOf(
  category: "help" | "feedback",
  criteria: unknown,
): Seed | null {
  if (category === "feedback") {
    const c = launchCriteria.safeParse(criteria).data ?? {};
    if (c.maker_in_audience === undefined) return null;
    return c.maker_in_audience ? "carrot" : "dandelion";
  }
  const c = helpCriteria.safeParse(criteria).data ?? {};
  if (c.author_in_audience === undefined) return null;
  const close = c.problem_match === "clear" || c.problem_match === "strong";
  return c.author_in_audience && close && c.own_situation
    ? "carrot"
    : "dandelion";
}

// The one line on a Today card saying why this person fits, from the same
// criteria: the problem of theirs you know ("No paying customers yet"). Null when
// nothing in the criteria says so (older scores): the card falls back to
// the match in words.
export function fitLine(
  category: "help" | "feedback",
  criteria: unknown,
  problems: string[],
): string | null {
  const parts: string[] = [];
  if (category === "feedback") {
    const c = launchCriteria.safeParse(criteria).data ?? {};
    if (c.early_stage) parts.push("Early stage");
    if (c.asks_for_feedback) parts.push("asks for feedback");
    if (c.maker_in_audience && parts.length < 2) parts.push("a maker");
  } else {
    const c = helpCriteria.safeParse(criteria).data ?? {};
    const problem =
      c.problem_match && c.problem_match !== "none" && c.matched_problem != null
        ? problems[c.matched_problem - 1]?.trim()
        : undefined;
    if (problem) parts.push(problem);
  }
  if (!parts.length) return null;
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
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

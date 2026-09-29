import { describe, expect, it } from "vitest";
import { explainCriteria } from "@/scoring/explain";
import {
  type JevAnswer,
  helpQuestions,
  jevHelpScore,
  jevLaunchScore,
  jevState,
} from "./jev";

const product = {
  name: "Greer",
  description: "Finds conversations where builders can help",
  audience: "Indie hackers",
  problems: ["Finding first users", "Getting feedback on an MVP"],
};

const n = (noul: number): JevAnswer => ({ type: "noul", noul });
const intent = (probabilities: Record<string, number>): JevAnswer => ({
  type: "choice",
  choice: Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]![0],
  probabilities,
  confidence: 0.8,
});

describe("helpQuestions", () => {
  it("asks one yes/no question per problem, naming it", () => {
    const q = helpQuestions(product);
    expect(Object.keys(q)).toEqual(
      expect.arrayContaining(["problem_0", "problem_1", "intent"]),
    );
    expect(q.problem_1).toMatchObject({
      type: "noul",
      instructions: { problem: "Getting feedback on an MVP" },
    });
  });
});

describe("jevState", () => {
  it("marks title-only posts and clips long text", () => {
    const s = jevState(product, { type: "story", title: "T", text: "" });
    expect(s.post.text).toBe("(no text, title only)");
    const long = jevState(product, {
      type: "comment",
      title: "T",
      text: "x".repeat(5000),
    });
    expect(long.post.text).toHaveLength(4000);
    expect(long.post.kind).toMatch(/comment/);
  });
});

describe("jevHelpScore", () => {
  it("weights probabilities like the LLM score and names the best problem", () => {
    const { score, criteria } = jevHelpScore(
      {
        own_situation: n(1),
        seeking_help: n(1),
        specific: n(1),
        reply_welcome: n(1),
        author_in_audience: n(0.8),
        intent: intent({ asking_for_help: 0.9, other: 0.1 }),
        problem_0: n(0.1),
        problem_1: n(0.9),
      },
      2,
    );
    expect(score).toBe(97); // 20 + 20 + 30 × 0.9 + 20 + 10
    expect(criteria).toMatchObject({
      problem_match: "strong",
      matched_problem: 2,
      intent: "asking_for_help",
      // Asked, but not part of the score: it only names the seed.
      author_in_audience: true,
    });
    // The "why" checklist still reads these criteria.
    expect(
      explainCriteria("help", criteria, product.problems).map((l) => l.label),
    ).toContain("Strongly matches: Getting feedback on an MVP");
  });

  it("caps threads where nobody asks for help or describes a struggle", () => {
    const { score, criteria } = jevHelpScore(
      {
        own_situation: n(1),
        seeking_help: n(0.2),
        specific: n(1),
        reply_welcome: n(1),
        author_in_audience: n(0.8),
        intent: intent({ discussion: 0.8, describing_pain: 0.2 }),
        problem_0: n(0.3),
        problem_1: n(0.1),
      },
      2,
    );
    expect(score).toBe(40);
    expect(criteria).toMatchObject({
      problem_match: "none",
      matched_problem: null,
    });
  });

  it("counts a described struggle as someone to help", () => {
    const { score } = jevHelpScore(
      {
        own_situation: n(1),
        seeking_help: n(0.1),
        specific: n(0),
        reply_welcome: n(1),
        author_in_audience: n(0.8),
        intent: intent({ describing_pain: 0.7, discussion: 0.3 }),
        problem_0: n(1),
        problem_1: n(0),
      },
      2,
    );
    expect(score).toBe(62); // 20 + 2 + 30 + 0 + 10
  });
});

describe("jevLaunchScore", () => {
  it("caps makers outside the audience", () => {
    const answers = {
      asks_for_feedback: n(1),
      early_stage: n(1),
      maker_in_audience: n(0.3),
      wants_users: n(1),
      useful_feedback_possible: n(1),
    };
    expect(jevLaunchScore(answers).score).toBe(40);
    // A maker in the audience who doesn't want users (an experiment) too.
    expect(
      jevLaunchScore({
        ...answers,
        maker_in_audience: n(1),
        wants_users: n(0.2),
      }).score,
    ).toBe(40);
    expect(jevLaunchScore({ ...answers, maker_in_audience: n(1) }).score).toBe(
      100,
    );
  });
});

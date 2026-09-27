import { describe, expect, it } from "vitest";
import { explainCriteria, intentLabel } from "./explain";

describe("explainCriteria", () => {
  it("names the matched problem from the builder's list", () => {
    const lines = explainCriteria(
      "help",
      {
        own_situation: true,
        seeking_help: false,
        problem_match: "strong",
        matched_problem: 2,
        specific: true,
        reply_welcome: true,
      },
      ["Outreach", "First paying customers"],
    );
    expect(lines).toEqual([
      { label: "Talks about their own situation", met: true },
      { label: "Doesn't ask for help", met: false },
      { label: "Strongly matches: First paying customers", met: true },
      { label: "Gives concrete details", met: true },
      { label: "A reply would be welcome", met: true },
    ]);
  });

  it("survives an out-of-range problem number and missing fields", () => {
    expect(
      explainCriteria(
        "help",
        { problem_match: "clear", matched_problem: 9 },
        [],
      ),
    ).toEqual([{ label: "Matches one of your problems", met: true }]);
    expect(explainCriteria("help", null, [])).toEqual([]);
  });

  it("explains launches with their own criteria", () => {
    expect(
      explainCriteria(
        "feedback",
        { asks_for_feedback: true, maker_in_audience: false },
        [],
      ),
    ).toEqual([
      { label: "Asks for feedback", met: true },
      { label: "The maker isn't in your audience", met: false },
    ]);
  });

  it("labels intents, falling back to the raw value", () => {
    expect(intentLabel("describing_pain")).toBe("Describing a problem");
    expect(intentLabel("new_intent")).toBe("new_intent");
  });
});

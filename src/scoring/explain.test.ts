import { describe, expect, it } from "vitest";
import { explainCriteria, fitLine, intentLabel, seedOf } from "./explain";

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

describe("fitLine", () => {
  const problems = ["No paying customers yet", "pricing"];

  it("names the problem of theirs you know", () => {
    expect(
      fitLine(
        "help",
        { problem_match: "clear", matched_problem: 1, reply_welcome: true },
        problems,
      ),
    ).toBe("No paying customers yet");
    expect(
      fitLine("help", { problem_match: "weak", matched_problem: 2 }, problems),
    ).toBe("Pricing");
  });

  it("is null without a matched problem", () => {
    expect(
      fitLine(
        "help",
        { problem_match: "none", matched_problem: 1, reply_welcome: true },
        problems,
      ),
    ).toBeNull();
    expect(fitLine("help", null, problems)).toBeNull();
  });

  it("describes a launch", () => {
    expect(
      fitLine(
        "feedback",
        { early_stage: true, asks_for_feedback: true, maker_in_audience: true },
        [],
      ),
    ).toBe("Early stage · asks for feedback");
    expect(fitLine("feedback", { early_stage: false }, [])).toBeNull();
  });
});

describe("seedOf", () => {
  const help = {
    own_situation: true,
    problem_match: "strong",
    author_in_audience: true,
  };

  it("calls someone in your audience, facing your problem, a carrot", () => {
    expect(seedOf("help", help)).toBe("carrot");
    expect(seedOf("help", { ...help, problem_match: "clear" })).toBe("carrot");
  });

  it("calls everything else worth a reply help in public", () => {
    expect(seedOf("help", { ...help, author_in_audience: false })).toBe(
      "dandelion",
    );
    expect(seedOf("help", { ...help, problem_match: "weak" })).toBe(
      "dandelion",
    );
    expect(seedOf("help", { ...help, own_situation: false })).toBe("dandelion");
  });

  it("follows the maker for launches", () => {
    expect(seedOf("feedback", { maker_in_audience: true })).toBe("carrot");
    expect(seedOf("feedback", { maker_in_audience: false })).toBe("dandelion");
  });

  it("says nothing for scores made before the question existed", () => {
    expect(seedOf("help", { own_situation: true })).toBeNull();
    expect(seedOf("feedback", {})).toBeNull();
  });
});

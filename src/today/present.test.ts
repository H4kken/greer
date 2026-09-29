import { describe, expect, it } from "vitest";
import type { Person } from "@/people/build";
import type { TodayEntry } from "./build";
import {
  eventLine,
  historyLine,
  matchLabel,
  sourceTag,
  summaryLine,
  topicOf,
} from "./present";

const person = (over: Partial<Person> = {}): Person => ({
  handle: "ana_r",
  kind: "thanked",
  conversations: 2,
  firstAt: new Date(),
  lastAt: new Date(),
  latest: null,
  openQuestion: null,
  threads: [],
  topicIds: [],
  triedAt: null,
  ...over,
});

describe("Today's words", () => {
  it("says how well you know someone, and about what", () => {
    expect(historyLine(person(), ["Pricing", "First users", "Sales"])).toBe(
      "Talked twice · pricing, first users",
    );
    expect(historyLine(person({ conversations: 1 }), [])).toBe("Talked once");
    expect(historyLine(person({ conversations: 4 }), [])).toBe(
      "Talked 4 times",
    );
    expect(historyLine(person({ kind: "waiting", conversations: 1 }), [])).toBe(
      "You replied once, no answer yet",
    );
  });

  it("says what someone did", () => {
    const answer = (
      tone: "question" | "thanks",
      open: boolean,
      launched = false,
    ) =>
      ({
        kind: "answer",
        answer: { tone, open },
        launch: launched ? {} : null,
      }) as TodayEntry;
    expect(eventLine(answer("question", true))).toBe("asked you a follow-up");
    expect(eventLine(answer("question", false))).toBe("asked you something");
    expect(eventLine(answer("thanks", false, true))).toBe(
      "thanked you, and launched something",
    );
    expect(eventLine({ kind: "stuck" } as TodayEntry)).toBe("is stuck");
    expect(eventLine({ kind: "launched" } as TodayEntry)).toBe(
      "launched something and asks for feedback",
    );
    expect(eventLine({ kind: "asks" } as TodayEntry)).toBe(
      "asked something new",
    );
  });

  it("leads with the topic, the source as a tag", () => {
    expect(topicOf("Ask HN: How do I find first users?")).toBe(
      "How do I find first users?",
    );
    expect(topicOf("Show HN: KnowNote – A local workspace")).toBe(
      "KnowNote – A local workspace",
    );
    expect(topicOf("Why pricing is hard")).toBe("Why pricing is hard");
    expect(topicOf("Ask HN:")).toBe("Ask HN:");

    const entry = (kind: TodayEntry["kind"]) => ({ kind }) as TodayEntry;
    const story = (title: string) => ({ type: "story" as const, title });
    expect(sourceTag(entry("stuck"), story("Ask HN: Pricing?"))).toBe("Ask HN");
    expect(sourceTag(entry("asks"), story("Show HN: Thing"))).toBe("Show HN");
    expect(sourceTag(entry("stuck"), story("Distribution is hard"))).toBe(
      "Post",
    );
    expect(
      sourceTag(entry("stuck"), { type: "comment", title: "Ask HN: x" }),
    ).toBe("Comment");
    expect(sourceTag(entry("launched"))).toBe("Show HN");
    expect(sourceTag(entry("launch"))).toBe("Show HN");
    expect(
      sourceTag({
        kind: "answer",
        answer: { tone: "thanks", open: false },
        launch: {},
      } as TodayEntry),
    ).toBe("Thanked you");
  });

  it("turns a score into words", () => {
    expect(matchLabel(92)).toBe("Strong match");
    expect(matchLabel(70)).toBe("Good match");
    expect(matchLabel(52)).toBe("Possible match");
  });

  it("sums up the day in one sentence", () => {
    expect(summaryLine(2, 3)).toBe(
      "2 people you know have news, and 3 new people could use your help.",
    );
    expect(summaryLine(1, 0)).toBe("1 person you know has news.");
    expect(summaryLine(0, 1)).toBe("1 person could use your help.");
    expect(summaryLine(0, 0)).toBe("Nobody new today. Greer keeps listening.");
    expect(summaryLine(1, 2, 1)).toBe(
      "1 person you know has news, 1 person you replied to has news, and 2 new people could use your help.",
    );
    expect(summaryLine(0, 0, 2)).toBe("2 people you replied to have news.");
  });
});

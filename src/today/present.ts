// Words for Today's cards. Pure, so the phrasing is unit-tested and stays
// the same on the server and in tests.
import type { Person } from "@/people/build";
import type { TodayEntry } from "./build";

const TIMES = ["", "once", "twice"];
const times = (n: number) => TIMES[n] ?? `${n} times`;

// "Talked twice · pricing, first users"; "You replied once, no answer yet".
export function historyLine(person: Person, topicNames: string[]): string {
  const head =
    person.kind === "waiting"
      ? `You replied ${times(person.conversations)}, no answer yet`
      : `Talked ${times(person.conversations)}`;
  const topics = topicNames.slice(0, 2).map((t) => t.toLowerCase());
  return topics.length ? `${head} · ${topics.join(", ")}` : head;
}

// What happened, after the handle: "devon_b asked you a follow-up".
export function eventLine(entry: TodayEntry): string {
  switch (entry.kind) {
    case "answer": {
      const { tone, open } = entry.answer;
      const said = open
        ? "asked you a follow-up"
        : tone === "question"
          ? "asked you something"
          : tone === "thanks"
            ? "thanked you"
            : tone === "disagreement"
              ? "disagreed with you"
              : "answered you";
      return entry.launch ? `${said}, and launched something` : said;
    }
    case "asks":
      return "asked something new";
    case "launch":
      return "launched something";
    case "stuck":
      return "is stuck";
    case "launched":
      return "launched something and asks for feedback";
  }
}

// How well a thread fits, in words rather than a number.
export function matchLabel(score: number): string {
  if (score >= 80) return "Strong match";
  if (score >= 65) return "Good match";
  return "Possible match";
}

// The line under the greeting: who's there today, in a sentence. People you
// replied to who haven't answered yet aren't "people you know" yet.
export function summaryLine(
  known: number,
  fresh: number,
  repliedTo = 0,
): string {
  const people = (n: number) => (n === 1 ? "person" : "people");
  const has = (n: number) => (n === 1 ? "has" : "have");
  const parts = [
    known > 0 && `${known} ${people(known)} you know ${has(known)} news`,
    repliedTo > 0 &&
      `${repliedTo} ${people(repliedTo)} you replied to ${has(repliedTo)} news`,
    fresh > 0 &&
      `${fresh} ${known + repliedTo > 0 ? "new " : ""}${people(fresh)} could use your help`,
  ].filter((p): p is string => !!p);
  if (!parts.length) return "Nobody new today. Greer keeps listening.";
  const last = parts.pop()!;
  return `${parts.length ? `${parts.join(", ")}, and ` : ""}${last}.`;
}

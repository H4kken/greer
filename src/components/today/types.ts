import type { PersonKind } from "@/people/build";
import type { AnswerTone } from "@/replies/classify";
import type { CriterionLine } from "@/scoring/explain";

// One card of Today's feed as the client sees it: dates and labels already
// turned into text on the server, so server and client render the same.
export type EntryView = {
  key: string;
  kind: "answer" | "asks" | "launch" | "stuck" | "launched";
  known: boolean;
  // Known only from the user's replies: they haven't answered yet.
  waiting: boolean;
  handle: string;
  when: string; // "5h ago"
  whenTitle: string; // absolute, for hover
  event: string; // "asked you a follow-up", "is stuck"
  headline: string; // their words, or the thread title
  quote: boolean; // headline is their words
  history: string | null; // "Talked twice · pricing"
  match: string | null; // "Strong match"
  // Stuck, asks and launched: the thread, with why Greer picked it.
  thread: {
    id: string;
    type: "story" | "comment";
    // A launch asks for feedback rather than help.
    category: "help" | "feedback";
    title: string;
    text: string;
    url: string;
    reason: string;
    criteria: CriterionLine[];
  } | null;
  // Answer: what they said, and where.
  answer: {
    tone: AnswerTone;
    text: string;
    url: string;
    threadTitle: string;
    open: boolean;
  } | null;
  launch: { title: string; url: string; when: string } | null;
  // Their other threads today, best first (one card per person).
  also: { id: string; title: string; url: string; when: string }[];
  // Known people: where you talked before.
  threads: { title: string; url: string }[];
};

export type NetworkPerson = {
  handle: string;
  kind: PersonKind | "new";
  conversations: number;
  news: boolean;
};

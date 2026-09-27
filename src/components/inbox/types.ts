import type { InboxView } from "@/inbox/queries";
import type { CriterionLine } from "@/scoring/explain";

// One thread as the client sees it: dates and labels already formatted on
// the server, so server and client render the same text.
export type InboxRow = {
  id: string;
  title: string;
  url: string;
  author: string;
  type: "story" | "comment";
  category: "help" | "feedback";
  postedLabel: string;
  postedTitle: string;
  intent: string;
  matched: string[];
  score: number;
  criteriaMet: number;
  criteriaTotal: number;
  criteria: CriterionLine[];
  reason: string;
  text: string;
  // Snoozed and dismissed views: when it was triaged, or until when.
  statusNote: string | null;
};

export type { InboxView };

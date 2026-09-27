// Account maturity tiers (see PLAN.md, "Account-aware guardrails"). The
// thresholds are first guesses, to be calibrated while dogfooding. Tiers only
// change advice: Greer warns, it never blocks.
import type { Platform } from "@/sources/types";

export type MaturityTier = "new" | "growing" | "established";

export type AccountFacts = { createdAt: Date; karma: number };

type Thresholds = {
  // Below either one: new.
  newBelow: { days: number; karma: number };
  // At or above both: established.
  establishedFrom: { days: number; karma: number };
};

const THRESHOLDS: Record<Platform, Thresholds> = {
  hn: {
    newBelow: { days: 30, karma: 100 },
    establishedFrom: { days: 365, karma: 1000 },
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function accountAgeDays(createdAt: Date, now = new Date()): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS),
  );
}

export function maturityTier(
  platform: Platform,
  account: AccountFacts,
  now = new Date(),
): MaturityTier {
  const t = THRESHOLDS[platform];
  const days = accountAgeDays(account.createdAt, now);
  if (days < t.newBelow.days || account.karma < t.newBelow.karma) return "new";
  if (
    days >= t.establishedFrom.days &&
    account.karma >= t.establishedFrom.karma
  ) {
    return "established";
  }
  return "growing";
}

export type MaturityAdvice = {
  label: string;
  repliesPerDay: number;
  productMentions: string;
};

export const MATURITY_ADVICE: Record<MaturityTier, MaturityAdvice> = {
  new: {
    label: "New",
    repliesPerDay: 3,
    productMentions:
      "Greer won't suggest mentioning your product yet: build trust by helping first.",
  },
  growing: {
    label: "Growing",
    repliesPerDay: 5,
    productMentions:
      "Greer will suggest mentioning your product only when someone explicitly asks for a tool like it.",
  },
  established: {
    label: "Established",
    repliesPerDay: 10,
    productMentions:
      "Greer may suggest mentioning your product when it's relevant, always help-first and disclosed.",
  },
};

// "5 months", "2 years", "12 days": for the account summary.
export function formatAccountAge(days: number): string {
  if (days < 60) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 730) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)} years`;
}

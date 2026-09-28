import { describe, expect, it } from "vitest";
import { answersDue } from "./answers";

const NOW = new Date("2026-09-28T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("answersDue", () => {
  it("checks a reply never looked at, however old", () => {
    expect(answersDue(ago(25 * DAY), null, NOW)).toBe(true);
  });

  it("checks fresh replies every poll", () => {
    expect(answersDue(ago(3 * HOUR), ago(1 * MIN), NOW)).toBe(true);
  });

  it("checks replies a few days old hourly, then every 6 hours", () => {
    expect(answersDue(ago(2 * DAY), ago(30 * MIN), NOW)).toBe(false);
    expect(answersDue(ago(2 * DAY), ago(HOUR), NOW)).toBe(true);
    expect(answersDue(ago(5 * DAY), ago(3 * HOUR), NOW)).toBe(false);
    expect(answersDue(ago(5 * DAY), ago(6 * HOUR), NOW)).toBe(true);
  });

  it("stops watching after two weeks", () => {
    expect(answersDue(ago(15 * DAY), ago(7 * DAY), NOW)).toBe(false);
  });
});

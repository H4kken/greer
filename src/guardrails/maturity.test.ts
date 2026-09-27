import { describe, expect, it } from "vitest";
import { accountAgeDays, formatAccountAge, maturityTier } from "./maturity";

const now = new Date("2026-09-27T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe("maturityTier (HN)", () => {
  it("treats a young or low-karma account as new", () => {
    expect(
      maturityTier("hn", { createdAt: daysAgo(10), karma: 5000 }, now),
    ).toBe("new");
    expect(
      maturityTier("hn", { createdAt: daysAgo(900), karma: 40 }, now),
    ).toBe("new");
  });

  it("needs both age and karma to be established", () => {
    expect(
      maturityTier("hn", { createdAt: daysAgo(150), karma: 212 }, now),
    ).toBe("growing");
    expect(
      maturityTier("hn", { createdAt: daysAgo(900), karma: 999 }, now),
    ).toBe("growing");
    expect(
      maturityTier("hn", { createdAt: daysAgo(365), karma: 1000 }, now),
    ).toBe("established");
  });
});

describe("account age", () => {
  it("counts whole days and never goes negative", () => {
    expect(accountAgeDays(daysAgo(3.5), now)).toBe(3);
    expect(accountAgeDays(daysAgo(-1), now)).toBe(0);
  });

  it("formats days, months and years", () => {
    expect(formatAccountAge(1)).toBe("1 day");
    expect(formatAccountAge(45)).toBe("45 days");
    expect(formatAccountAge(150)).toBe("5 months");
    expect(formatAccountAge(1100)).toBe("3 years");
  });
});

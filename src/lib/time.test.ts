import { describe, expect, it } from "vitest";
import { formatAbsolute, formatRelative } from "./time";

const now = new Date("2026-09-27T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("formatRelative", () => {
  it("uses short relative times for the last week", () => {
    expect(formatRelative(ago(20_000), now)).toBe("just now");
    expect(formatRelative(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe("3h ago");
    expect(formatRelative(ago(2 * 86_400_000), now)).toBe("2d ago");
  });

  it("falls back to the date, with the year when it differs", () => {
    expect(formatRelative(new Date("2026-09-13T08:00:00Z"), now)).toBe(
      "Sep 13",
    );
    expect(formatRelative(new Date("2025-12-01T08:00:00Z"), now)).toBe(
      "Dec 1, 2025",
    );
  });
});

it("formats absolute times in UTC", () => {
  expect(formatAbsolute(new Date("2026-09-13T14:05:00Z"))).toBe(
    "Sep 13, 2026, 14:05 UTC",
  );
});

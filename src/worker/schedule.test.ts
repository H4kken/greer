import { describe, expect, it } from "vitest";
import { INGEST_CRON, nextIngestAt } from "./schedule";

describe("nextIngestAt", () => {
  it("is the next quarter hour, never the current minute", () => {
    expect(nextIngestAt(new Date("2026-09-28T12:07:30Z"))).toEqual(
      new Date("2026-09-28T12:15:00Z"),
    );
    expect(nextIngestAt(new Date("2026-09-28T12:15:00Z"))).toEqual(
      new Date("2026-09-28T12:30:00Z"),
    );
    expect(nextIngestAt(new Date("2026-09-28T23:59:00Z"))).toEqual(
      new Date("2026-09-29T00:00:00Z"),
    );
  });

  it("matches the worker's cron", () => {
    expect(INGEST_CRON).toBe("*/15 * * * *");
  });
});

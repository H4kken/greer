import { describe, expect, it } from "vitest";
import { describeScan, type ScanProgress, SEARCH_SHARE } from "./scan-copy";

function progress(over: Partial<ScanProgress> = {}): ScanProgress {
  return {
    queries: { total: 4, finished: 4, failed: 0 },
    found: 300,
    kept: 241,
    scored: 0,
    people: 0,
    top: [],
    ...over,
  };
}

describe("describeScan", () => {
  it("reads threads when a model is set", () => {
    const copy = describeScan(progress({ scored: 120, people: 3 }), {
      modelConfigured: true,
    });
    expect(copy.needsModel).toBe(false);
    expect(copy.headline).toBe("Reading the last 7 days of Hacker News");
    expect(copy.subline).toBe("Found 3 people you could help so far.");
    expect(copy.progressLabel).toBe("120 of 241 read");
  });

  it("says it's waiting for a model instead of reading forever", () => {
    const copy = describeScan(progress(), { modelConfigured: false });
    expect(copy.needsModel).toBe(true);
    expect(copy.headline).toBe("Found 241 threads to read");
    expect(copy.subline).toMatch(/Connect an AI model/);
    expect(copy.progressLabel).toBe("Waiting for an AI model");
    expect(copy.ratio).toBe(SEARCH_SHARE);
  });

  it("keeps searching while waiting for a model", () => {
    const copy = describeScan(
      progress({ queries: { total: 4, finished: 1, failed: 0 }, kept: 12 }),
      { modelConfigured: false },
    );
    expect(copy.headline).toBe("Searching the last 7 days of Hacker News");
    expect(copy.progressLabel).toBe("1 of 4 searches done");
  });

  it("uses the singular for one thread", () => {
    expect(
      describeScan(progress({ kept: 1 }), { modelConfigured: false }).headline,
    ).toBe("Found 1 thread to read");
  });

  it("is done when everything kept is scored", () => {
    const copy = describeScan(progress({ scored: 241, people: 8 }), {
      modelConfigured: true,
    });
    expect(copy.done).toBe(true);
    expect(copy.ratio).toBe(1);
    expect(copy.progressLabel).toBe("Done");
    expect(copy.headline).toBe("8 people you could help today");
  });

  it("finishes with nothing to read even without a model", () => {
    const copy = describeScan(progress({ kept: 0 }), {
      modelConfigured: false,
    });
    expect(copy.done).toBe(true);
    expect(copy.needsModel).toBe(false);
    expect(copy.headline).toBe("No one to help just yet");
  });
});

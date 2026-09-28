import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./pricing";

describe("estimateCostUsd", () => {
  it("prices Claude input and output tokens", () => {
    expect(estimateCostUsd("claude-haiku-4-5", 1_000_000, 100_000)).toBe(1.5);
  });

  it("prices every Jev version on input tokens only", () => {
    expect(estimateCostUsd("jev-1.13.0", 1_000_000, 500)).toBeCloseTo(0.042);
  });

  it("shows no cost for unknown models rather than a guess", () => {
    expect(estimateCostUsd("llama3", 1000, 1000)).toBeNull();
  });
});

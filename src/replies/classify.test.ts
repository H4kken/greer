import { describe, expect, it } from "vitest";
import { toneOf } from "./classify";

const signals = (
  o: Partial<Record<"thanks" | "asks_builder" | "disagrees", boolean>>,
) => ({
  thanks: false,
  asks_builder: false,
  disagrees: false,
  reason: "",
  ...o,
});

describe("toneOf", () => {
  it("puts a question first: someone is waiting for an answer", () => {
    expect(toneOf(signals({ thanks: true, asks_builder: true }))).toBe(
      "question",
    );
  });

  it("reads 'thanks, but…' as thanks", () => {
    expect(toneOf(signals({ thanks: true, disagrees: true }))).toBe("thanks");
  });

  it("falls back to disagreement, then neutral", () => {
    expect(toneOf(signals({ disagrees: true }))).toBe("disagreement");
    expect(toneOf(signals({}))).toBe("neutral");
  });
});

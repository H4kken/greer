import { describe, expect, it } from "vitest";
import { normalizeTopic } from "./topics";

describe("normalizeTopic", () => {
  it("uses sentence case and tidy spacing", () => {
    expect(normalizeTopic("  first   USERS ")).toBe("First users");
    expect(normalizeTopic("pricing.")).toBe("Pricing");
  });

  it("keeps acronyms and brand casing", () => {
    expect(normalizeTopic("B2B sales")).toBe("B2B sales");
    expect(normalizeTopic("SaaS pricing")).toBe("SaaS pricing");
  });

  it("never returns an empty name", () => {
    expect(normalizeTopic("   ")).toBe("Other");
  });
});

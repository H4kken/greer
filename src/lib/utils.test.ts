import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins conditional classes and resolves Tailwind conflicts", () => {
    const active = true;
    expect(cn("px-2 py-1", active && "px-4", { hidden: false })).toBe(
      "py-1 px-4",
    );
  });
});

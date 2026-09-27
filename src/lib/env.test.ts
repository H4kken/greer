import { expect, it } from "vitest";
import { dropEmptyEnv } from "./env";

it("removes empty variables and keeps the rest", () => {
  const env: Record<string, string | undefined> = { A: "", B: "value", C: " " };
  dropEmptyEnv(env);
  expect(env).toEqual({ B: "value", C: " " });
});

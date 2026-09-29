import { describe, expect, it } from "vitest";
import { orbitNow, orbitPoint } from "./use-orbit";

describe("orbitPoint", () => {
  const node = { x: 80, y: 50, size: 16, turn: 150 };

  it("puts a person at the same place for the same moment, on any map", () => {
    const t = orbitNow(Date.UTC(2026, 8, 29, 12));
    expect(orbitPoint(node, 3, t)).toEqual(orbitPoint({ ...node }, 3, t));
  });

  it("turns around you as time passes, at the node's pace", () => {
    const t = orbitNow(Date.UTC(2026, 8, 29, 12));
    const angle = (p: { x: number; y: number }) =>
      Math.atan2(p.y - 50, p.x - 50);
    // A quarter of a turn later, a quarter of a turn further (±rounding).
    const turned =
      angle(orbitPoint(node, 0, t + 150 / 4)) - angle(orbitPoint(node, 0, t));
    const quarter = Math.PI / 2;
    const d = ((turned % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(Math.abs(d - quarter)).toBeLessThan(0.01);
  });

  it("stays close to its distance from you", () => {
    const p = orbitPoint(node, 1, orbitNow());
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeGreaterThan(27);
    expect(Math.hypot(p.x - 50, p.y - 50)).toBeLessThan(33);
  });
});

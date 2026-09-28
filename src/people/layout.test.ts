import { describe, expect, it } from "vitest";
import { MAP_MAX_PEOPLE, placePeople } from "./layout";

const person = (handle: string, conversations: number) => ({
  handle,
  conversations,
});
const distance = (p: { x: number; y: number }) =>
  Math.hypot(p.x - 50, p.y - 50);

describe("placePeople", () => {
  it("puts people you talked with more closer to you, and bigger", () => {
    const [close, mid, far] = placePeople([
      person("sarahk", 3),
      person("devon_b", 2),
      person("tomw", 1),
    ]);
    expect(distance(close!)).toBeLessThan(distance(mid!));
    expect(distance(mid!)).toBeLessThan(distance(far!));
    expect(close!.size).toBeGreaterThan(far!.size);
  });

  it("keeps everyone inside the map, and positions stable", () => {
    const people = Array.from({ length: 80 }, (_, i) =>
      person(`user${i}`, (i % 3) + 1),
    );
    const placed = placePeople(people);
    expect(placed).toHaveLength(MAP_MAX_PEOPLE);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(5);
      expect(p.x).toBeLessThanOrEqual(95);
      expect(p.y).toBeGreaterThanOrEqual(5);
      expect(p.y).toBeLessThanOrEqual(95);
    }
    expect(placePeople(people)).toEqual(placed);
  });
});

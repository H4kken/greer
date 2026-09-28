// Where each person sits on the People map, in % of a square. Closer and
// bigger = more conversations. Positions come from the handle, so the map
// doesn't reshuffle between visits.

export const MAP_MAX_PEOPLE = 60;

// Radius (in % of the side) and dot size (px) by number of conversations.
export function tierOf(conversations: number) {
  if (conversations >= 3) return { radius: 18, size: 32 };
  if (conversations === 2) return { radius: 29, size: 24 };
  return { radius: 39, size: 16 };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GOLDEN_ANGLE = 137.508;

export function placePeople<
  T extends { handle: string; conversations: number },
>(people: T[]): (T & { x: number; y: number; size: number })[] {
  return people.slice(0, MAP_MAX_PEOPLE).map((p, i) => {
    const h = hash(p.handle);
    const { radius, size } = tierOf(p.conversations);
    // Spread around the circle, with a little per-person wobble in and out.
    const angle = ((i * GOLDEN_ANGLE + (h % 20)) * Math.PI) / 180;
    const r = radius + ((h >> 8) % 7) - 3;
    return {
      ...p,
      x: Number((50 + r * Math.cos(angle)).toFixed(2)),
      y: Number((50 + r * Math.sin(angle)).toFixed(2)),
      size,
    };
  });
}

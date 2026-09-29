import { describe, expect, it } from "vitest";
import { type DayReply, dayProgress, progressLine } from "./progress";

const today = (h: number) => new Date(Date.UTC(2026, 8, 28, h));
const yesterday = new Date(Date.UTC(2026, 8, 27, 22));
const isToday = (d: Date) => d.getUTCDate() === 28;
const reply = (id: string, at: Date, handle: string | null): DayReply => ({
  id,
  at,
  handle,
});

const progress = (replies: DayReply[], pace = 3) =>
  dayProgress({
    replies,
    answers: [
      { at: today(9), author: "sarahk" },
      { at: today(10), author: "SARAHK" },
      { at: yesterday, author: "devon_b" },
    ],
    pace,
    isToday,
  });

describe("dayProgress", () => {
  it("counts people helped today, once each, first reply first", () => {
    const p = progress([
      reply("1", today(11), "ana_r"),
      reply("2", today(8), "kvn"),
      reply("3", today(12), "Ana_R"),
      reply("4", yesterday, "old"),
    ]);
    expect(p.helped.map((h) => h.handle)).toEqual(["kvn", "ana_r"]);
    // Two people, three replies: the pace counts people.
    expect(p).toMatchObject({
      replies: 3,
      answeredBy: 1,
      state: "under",
      room: 1,
    });
  });

  it("counts replies to unknown authors once per reply", () => {
    const p = progress([
      reply("1", today(8), null),
      reply("2", today(9), null),
    ]);
    expect(p.helped).toHaveLength(2);
  });

  it("says where the day stands against the pace, warning past it", () => {
    expect(progressLine(progress([]), 3)).toBe(
      "No replies yet today. Up to 3 people is a good pace for your account.",
    );
    expect(progressLine(progress([reply("1", today(8), "kvn")]), 3)).toBe(
      "You helped 1 person today · room for 2 more at your pace.",
    );
    const three = ["a", "b", "c"].map((h, i) => reply(h, today(8 + i), h));
    expect(progressLine(progress(three), 3)).toBe(
      "You helped 3 people today. That's a good day; the rest can wait.",
    );
    const five = ["a", "b", "c", "d", "e"].map((h, i) =>
      reply(h, today(8 + i), h),
    );
    expect(progressLine(progress(five), 3)).toBe(
      "You helped 5 people today, past your pace of 3. Slowing down keeps your account safe.",
    );
  });
});

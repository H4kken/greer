// The day so far: who the user helped, measured against the account's safe
// pace. Like Today's feed, the pace counts people, not replies: a back and
// forth with one person is one conversation. Pure; the caller says what
// "today" is, since only the browser knows the user's time zone.

export type DayReply = { id: string; at: Date; handle: string | null };
export type DayAnswer = { at: Date; author: string };

export type DayProgress = {
  // People the user replied to today, first reply first.
  helped: { key: string; handle: string | null }[];
  replies: number;
  // People who answered the user today: what others gave back.
  answeredBy: number;
  state: "none" | "under" | "at" | "over";
  // People left before the pace; 0 at or past it.
  room: number;
};

export function dayProgress({
  replies,
  answers,
  pace,
  isToday,
}: {
  replies: DayReply[];
  answers: DayAnswer[];
  pace: number;
  isToday: (d: Date) => boolean;
}): DayProgress {
  const todays = replies
    .filter((r) => isToday(r.at))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const helped = new Map<string, { key: string; handle: string | null }>();
  for (const r of todays) {
    // Unknown authors (deleted comments) still count, once per reply.
    const key = r.handle ? r.handle.toLowerCase() : `reply:${r.id}`;
    if (!helped.has(key)) helped.set(key, { key, handle: r.handle });
  }
  const n = helped.size;
  return {
    helped: [...helped.values()],
    replies: todays.length,
    answeredBy: new Set(
      answers.filter((a) => isToday(a.at)).map((a) => a.author.toLowerCase()),
    ).size,
    state: n === 0 ? "none" : n < pace ? "under" : n === pace ? "at" : "over",
    room: Math.max(0, pace - n),
  };
}

// One calm sentence about the day. Past the pace it warns, never blocks.
export function progressLine(p: DayProgress, pace: number): string {
  const people = p.helped.length;
  const helped = `You helped ${people} ${people === 1 ? "person" : "people"} today`;
  switch (p.state) {
    case "none":
      return `No replies yet today. Up to ${pace} people is a good pace for your account.`;
    case "under":
      return `${helped} · room for ${p.room} more at your pace.`;
    case "at":
      return `${helped}. That's a good day; the rest can wait.`;
    case "over":
      return `${helped}, past your pace of ${pace}. Slowing down keeps your account safe.`;
  }
}

export const TIME_ZONE_COOKIE = "tz";

// "Same calendar day as now" in the viewer's time zone, for the server (the
// browser saves its zone in a cookie). Without a valid zone: the last 24h.
export function sameDayAs(
  now: Date,
  timeZone: string | null | undefined,
): (d: Date) => boolean {
  if (timeZone) {
    try {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone });
      const today = day.format(now);
      return (d) => day.format(d) === today;
    } catch {
      // Unknown zone: fall through.
    }
  }
  return (d) =>
    d.getTime() > now.getTime() - 24 * 60 * 60 * 1000 &&
    d.getTime() <= now.getTime();
}

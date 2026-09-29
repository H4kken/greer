"use client";

import { useEffect, useSyncExternalStore } from "react";
import { dayProgress, progressLine, TIME_ZONE_COOKIE } from "@/today/progress";
import { useMinute } from "./use-minute";

const noSubscribe = () => () => {};

// The day so far, in the viewer's own time zone: a face for each person
// helped, an empty dashed circle for the room left in the pace (the same
// dashed circle as "could meet today" on the network). Shown once in the
// browser, since the server can't know what "today" is for the viewer.
export function DayProgress({
  replies,
  answers,
  pace,
  serverNow,
}: {
  replies: { id: string; at: string; handle: string | null }[];
  answers: { at: string; author: string }[];
  pace: number;
  serverNow: number;
}) {
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const now = useMinute(serverNow);
  // Tell the server what "today" is here, so the feed offers only the room
  // left in today's pace (see loadToday).
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!document.cookie.includes(`${TIME_ZONE_COOKIE}=${zone}`)) {
      document.cookie = `${TIME_ZONE_COOKIE}=${zone}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);
  if (!inBrowser) return <div aria-hidden className="h-7" />;

  const isToday = (d: Date) => d.toDateString() === now.toDateString();
  const p = dayProgress({
    replies: replies.map((r) => ({ ...r, at: new Date(r.at) })),
    answers: answers.map((a) => ({ ...a, at: new Date(a.at) })),
    pace,
    isToday,
  });

  return (
    <div
      aria-live="polite"
      className="flex flex-col items-start gap-1.5 text-sm text-muted-foreground lg:items-end lg:text-right"
    >
      {(p.helped.length > 0 || p.room > 0) && (
        <span aria-hidden className="flex items-center gap-1.5">
          {p.helped.length > 0 && (
            <span className="flex items-center -space-x-1.5">
              {p.helped.slice(0, 10).map((h) => (
                <span
                  key={h.key}
                  title={h.handle ?? undefined}
                  className="flex size-6 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-medium text-primary-foreground ring-2 ring-background"
                >
                  {h.handle?.charAt(0).toUpperCase()}
                </span>
              ))}
            </span>
          )}
          {Array.from({ length: p.room }, (_, i) => (
            <span
              key={i}
              className="size-5 rounded-full border-2 border-dashed border-primary/45"
            />
          ))}
        </span>
      )}
      <span>
        {progressLine(p, pace)}
        {p.answeredBy > 0 &&
          ` ${p.answeredBy} ${p.answeredBy === 1 ? "person" : "people"} answered you today.`}
      </span>
    </div>
  );
}

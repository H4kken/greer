"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { nextIngestAt } from "@/worker/schedule";
import { useMinute } from "./use-minute";

const MINUTE = 60_000;

function minutes(ms: number): string {
  const n = Math.max(1, Math.round(ms / MINUTE));
  return n === 1 ? "1 min" : `${n} min`;
}

// "Checked 3 min ago · next check in 12 min". A minute after each check,
// the page reloads its data, so new people show up without a reload.
export function NextCheck({
  lastCheckAt,
  workerRunning,
  serverNow,
}: {
  lastCheckAt: string | null;
  workerRunning: boolean;
  serverNow: number;
}) {
  const router = useRouter();
  const now = useMinute(serverNow);
  const next = nextIngestAt(now);
  // The check this page is waiting for: refresh once it has had time to run.
  const waitingFor = useRef(nextIngestAt(new Date(serverNow)).getTime());
  useEffect(() => {
    if (now.getTime() >= waitingFor.current + MINUTE) {
      waitingFor.current = next.getTime();
      router.refresh();
    }
  }, [now, next, router]);

  if (!workerRunning)
    return (
      <span>
        Greer&apos;s background worker isn&apos;t running, so there are no new
        checks.
      </span>
    );
  const last = lastCheckAt ? now.getTime() - Date.parse(lastCheckAt) : null;
  return (
    <span>
      {last !== null &&
        (last < MINUTE
          ? "Checked just now · "
          : `Checked ${minutes(last)} ago · `)}
      next check in {minutes(next.getTime() - now.getTime())}
    </span>
  );
}

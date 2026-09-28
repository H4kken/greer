"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}

const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;

// The current time, to the minute, in the browser. The server renders with
// its own time (`serverNow`), and the browser takes over after hydration.
export function useMinute(serverNow: number): Date {
  const ms = useSyncExternalStore(subscribe, currentMinute, () => serverNow);
  return new Date(ms);
}

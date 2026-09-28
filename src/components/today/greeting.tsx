"use client";

import { useSyncExternalStore } from "react";

function helloNow(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Hello";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// The time of day doesn't need live updates on this page.
const subscribe = () => () => {};

// "Good morning, Mathis" in the viewer's own time of day. The server doesn't
// know it, so it renders a plain hello and the browser fills in the rest.
export function Greeting({ name }: { name: string }) {
  const hello = useSyncExternalStore(subscribe, helloNow, () => "Hello");
  const first = name.trim().split(/\s+/)[0];
  return (
    <h1 className="text-4xl font-medium tracking-tight">
      {first ? `${hello}, ${first}` : hello}
    </h1>
  );
}

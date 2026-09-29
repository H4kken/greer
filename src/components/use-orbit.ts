"use client";

import { useEffect, useRef } from "react";

// One person on a network map, placed in % of the box around "You" (50, 50).
export type OrbitNode = { x: number; y: number; size: number; turn: number };

// Drift, in % of the box: each person moves a little closer and further.
const DRIFT = 2;

// Slowly turns a network map around "You": each dot orbits at its own
// `turn` (seconds per turn; negative turns the other way) and drifts in and
// out. Moves the DOM directly each frame, with transforms (no layout, no
// pixel snapping) rather than a React render per frame. The first paint
// (server and browser) is the resting layout; reduced motion keeps it.
// Mark the i-th person's dot with `data-orbit-dot={i}` and their line to
// you with `data-orbit-line={i}`, inside the element given `ref={box}`.
// With `pauseOnHover`, the map holds still under the pointer or keyboard
// focus, so its dots stay easy to pick.
export function useOrbit(
  nodes: OrbitNode[],
  { pauseOnHover = false }: { pauseOnHover?: boolean } = {},
) {
  const box = useRef<HTMLDivElement>(null);
  const key = nodes.map((n) => `${n.x},${n.y},${n.size},${n.turn}`).join();

  useEffect(() => {
    const el = box.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const layout = nodes.map((n, i) => ({
      r: Math.hypot(n.x - 50, n.y - 50),
      angle: Math.atan2(n.y - 50, n.x - 50),
      turn: n.turn,
      breath: 6 + (i % 4) * 1.5,
      size: n.size,
    }));
    let { width, height } = el.getBoundingClientRect();
    const resized = new ResizeObserver(([entry]) => {
      ({ width, height } = entry!.contentRect);
    });
    resized.observe(el);

    let hovered = false;
    let focused = false;
    const listeners: [string, () => void][] = pauseOnHover
      ? [
          ["pointerenter", () => (hovered = true)],
          ["pointerleave", () => (hovered = false)],
          ["focusin", () => (focused = true)],
          ["focusout", () => (focused = false)],
        ]
      : [];
    for (const [type, fn] of listeners) el.addEventListener(type, fn);

    const dots = nodes.map((_, i) =>
      el.querySelector<HTMLElement>(`[data-orbit-dot="${i}"]`),
    );
    const lines = nodes.map((_, i) =>
      el.querySelector<SVGLineElement>(`[data-orbit-line="${i}"]`),
    );
    // From now on transforms place the dots, from the box's top-left corner.
    for (const dot of dots) {
      dot?.style.setProperty("left", "0");
      dot?.style.setProperty("top", "0");
    }
    let frame = 0;
    let last: number | null = null;
    let t = 0; // seconds of motion, not counting pauses
    const tick = (ms: number) => {
      if (last !== null && !hovered && !focused) t += (ms - last) / 1000;
      last = ms;
      layout.forEach((l, i) => {
        const angle = l.angle + (2 * Math.PI * t) / l.turn;
        const r = l.r + DRIFT * Math.sin((2 * Math.PI * t) / l.breath + i);
        const x = 50 + r * Math.cos(angle);
        const y = 50 + r * Math.sin(angle);
        dots[i]?.style.setProperty(
          "transform",
          `translate3d(${(x / 100) * width - l.size / 2}px, ${(y / 100) * height}px, 0) translateY(-50%)`,
        );
        lines[i]?.setAttribute("x2", x.toFixed(3));
        lines[i]?.setAttribute("y2", y.toFixed(3));
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      for (const [type, fn] of listeners) el.removeEventListener(type, fn);
    };
    // The motion only changes when the people do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pauseOnHover]);

  return box;
}

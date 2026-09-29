"use client";

import { useEffect, useRef } from "react";

// One person on a network map, placed in % of the box around "You" (50, 50).
export type OrbitNode = { x: number; y: number; size: number; turn: number };

// Drift, in % of the box: each person moves a little closer and further.
const DRIFT = 2;
// Near the pointer dots slow almost to a stop, so one is easy to pick, and
// speed up again with distance (px from the dot and its name).
const NEAR_PX = 60;
const FAR_PX = 220;
const SLOWEST = 0.04;
// How fast a dot's speed follows its target, per second: it eases, never
// jumps.
const EASE = 5;

// 0 at `near` and closer, 1 at `far` and further, smooth in between.
function smoothstep(near: number, far: number, d: number) {
  const t = Math.min(1, Math.max(0, (d - near) / (far - near)));
  return t * t * (3 - 2 * t);
}

// Slowly turns a network map around "You": each dot orbits at its own
// `turn` (seconds per turn; negative turns the other way) and drifts in and
// out. Moves the DOM directly each frame, with transforms (no layout, no
// pixel snapping) rather than a React render per frame. The first paint
// (server and browser) is the resting layout; reduced motion keeps it.
// Mark the i-th person's dot with `data-orbit-dot={i}` and their line to
// you with `data-orbit-line={i}`, inside the element given `ref={box}`.
// Dots near the pointer slow right down, each at its own pace, and the
// whole map holds still while keyboard focus is inside it.
export function useOrbit(nodes: OrbitNode[]) {
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

    // The pointer, in px from the box's top-left corner; null when away.
    let pointer: { x: number; y: number } | null = null;
    let focused = false;
    const listeners: [string, (e: Event) => void][] = [
      [
        "pointermove",
        (e) => {
          const box = el.getBoundingClientRect();
          const { clientX, clientY } = e as PointerEvent;
          pointer = { x: clientX - box.left, y: clientY - box.top };
        },
      ],
      ["pointerleave", () => (pointer = null)],
      ["focusin", () => (focused = true)],
      ["focusout", () => (focused = false)],
    ];
    for (const [type, fn] of listeners) el.addEventListener(type, fn);

    const dots = nodes.map((_, i) =>
      el.querySelector<HTMLElement>(`[data-orbit-dot="${i}"]`),
    );
    const lines = nodes.map((_, i) =>
      el.querySelector<SVGLineElement>(`[data-orbit-line="${i}"]`),
    );
    // Where a dot's name ends, so the slow zone covers the name too.
    const widths = dots.map((d, i) => d?.offsetWidth ?? layout[i]!.size);
    // From now on transforms place the dots, from the box's top-left corner.
    for (const dot of dots) {
      dot?.style.setProperty("left", "0");
      dot?.style.setProperty("top", "0");
    }
    let frame = 0;
    let last: number | null = null;
    // Each dot keeps its own clock (seconds of motion) and speed (0 to 1).
    const clocks = layout.map(() => 0);
    const speeds = layout.map(() => 1);
    const tick = (ms: number) => {
      const dt = last === null ? 0 : Math.min(0.1, (ms - last) / 1000);
      last = ms;
      layout.forEach((l, i) => {
        const t = clocks[i]!;
        const angle = l.angle + (2 * Math.PI * t) / l.turn;
        const r = l.r + DRIFT * Math.sin((2 * Math.PI * t) / l.breath + i);
        const x = 50 + r * Math.cos(angle);
        const y = 50 + r * Math.sin(angle);
        const left = (x / 100) * width - l.size / 2;
        const top = (y / 100) * height;
        dots[i]?.style.setProperty(
          "transform",
          `translate3d(${left}px, ${top}px, 0) translateY(-50%)`,
        );
        lines[i]?.setAttribute("x2", x.toFixed(3));
        lines[i]?.setAttribute("y2", y.toFixed(3));

        // Distance from the pointer to the dot and its name.
        let target = 1;
        if (focused) target = 0;
        else if (pointer) {
          const dx = Math.max(
            left - pointer.x,
            0,
            pointer.x - left - widths[i]!,
          );
          const dy = pointer.y - top;
          target =
            SLOWEST +
            (1 - SLOWEST) * smoothstep(NEAR_PX, FAR_PX, Math.hypot(dx, dy));
        }
        speeds[i]! += (target - speeds[i]!) * Math.min(1, dt * EASE);
        clocks[i]! += dt * speeds[i]!;
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
  }, [key]);

  return box;
}

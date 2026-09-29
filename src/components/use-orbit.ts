"use client";

import { useCallback, useEffect, useRef } from "react";

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

// Zoom, around the resting view (1): out to see the map with room around
// it, in to spread crowded people apart.
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
// How much one wheel notch (100 px of deltaY) zooms: about 16%.
const ZOOM_PER_PX = 0.0015;
// How fast the view follows a zoom, per second: smooth, not stepped.
const ZOOM_EASE = 12;

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
// With `zoomable`, the wheel zooms in and out around the pointer: people
// spread apart while dots and names keep their size. Mark "You" with
// `data-orbit-center` so it follows. `onZoom` hears whether the map is
// zoomed at all; `reset` (returned) brings the resting view back.
export function useOrbit(
  nodes: OrbitNode[],
  {
    zoomable = false,
    onZoom,
  }: { zoomable?: boolean; onZoom?: (zoomed: boolean) => void } = {},
) {
  const box = useRef<HTMLDivElement>(null);
  const resetRef = useRef(() => {});
  const onZoomRef = useRef(onZoom);
  const key = nodes.map((n) => `${n.x},${n.y},${n.size},${n.turn}`).join();

  useEffect(() => {
    onZoomRef.current = onZoom;
  });

  useEffect(() => {
    const el = box.current;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion keeps the resting layout, zoom aside.
    if (!el || (still && !zoomable)) return;
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

    // The view: screen = world × zoom + shift (px). The target moves at once
    // on a wheel; the view eases after it.
    const view = { zoom: 1, x: 0, y: 0 };
    const target = { ...view };
    let zoomed = false;
    // Zoomed in, the map keeps covering the box (no empty edges); zoomed
    // out, it stays inside it.
    const clampTarget = () => {
      const spareX = width * (1 - target.zoom);
      const spareY = height * (1 - target.zoom);
      target.x = Math.min(
        Math.max(0, spareX),
        Math.max(Math.min(0, spareX), target.x),
      );
      target.y = Math.min(
        Math.max(0, spareY),
        Math.max(Math.min(0, spareY), target.y),
      );
    };
    const tellZoomed = () => {
      const now = Math.abs(target.zoom - 1) > 0.001;
      if (now !== zoomed) onZoomRef.current?.((zoomed = now));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const lines = e.deltaMode === 1 ? 16 : 1; // Firefox scrolls in lines
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(
          MIN_ZOOM,
          target.zoom * Math.exp(-e.deltaY * lines * ZOOM_PER_PX),
        ),
      );
      // The point under the pointer stays under the pointer.
      target.x = px - ((px - target.x) * zoom) / target.zoom;
      target.y = py - ((py - target.y) * zoom) / target.zoom;
      target.zoom = zoom;
      clampTarget();
      tellZoomed();
    };
    if (zoomable) el.addEventListener("wheel", onWheel, { passive: false });
    resetRef.current = () => {
      Object.assign(target, { zoom: 1, x: 0, y: 0 });
      tellZoomed();
    };
    const center = el.querySelector<HTMLElement>("[data-orbit-center]");

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
    const speeds = layout.map(() => (still ? 0 : 1));
    const tick = (ms: number) => {
      const dt = last === null ? 0 : Math.min(0.1, (ms - last) / 1000);
      last = ms;
      const follow = still ? 1 : Math.min(1, dt * ZOOM_EASE);
      view.zoom += (target.zoom - view.zoom) * follow;
      view.x += (target.x - view.x) * follow;
      view.y += (target.y - view.y) * follow;
      // World (% of the box) to screen: px and % of the box.
      const sx = (x: number) => (x / 100) * width * view.zoom + view.x;
      const sy = (y: number) => (y / 100) * height * view.zoom + view.y;
      const cx = sx(50);
      const cy = sy(50);
      center?.style.setProperty(
        "transform",
        `translate3d(${cx - width / 2}px, ${cy - height / 2}px, 0)`,
      );
      layout.forEach((l, i) => {
        const t = clocks[i]!;
        const angle = l.angle + (2 * Math.PI * t) / l.turn;
        const r = l.r + DRIFT * Math.sin((2 * Math.PI * t) / l.breath + i);
        const x = 50 + r * Math.cos(angle);
        const y = 50 + r * Math.sin(angle);
        const left = sx(x) - l.size / 2;
        const top = sy(y);
        dots[i]?.style.setProperty(
          "transform",
          `translate3d(${left}px, ${top}px, 0) translateY(-50%)`,
        );
        const line = lines[i];
        if (line) {
          line.setAttribute("x1", ((cx / width) * 100).toFixed(3));
          line.setAttribute("y1", ((cy / height) * 100).toFixed(3));
          line.setAttribute(
            "x2",
            (((left + l.size / 2) / width) * 100).toFixed(3),
          );
          line.setAttribute("y2", ((top / height) * 100).toFixed(3));
        }

        // Distance from the pointer to the dot and its name.
        let goal = still ? 0 : 1;
        if (focused) goal = 0;
        else if (pointer && !still) {
          const dx = Math.max(
            left - pointer.x,
            0,
            pointer.x - left - widths[i]!,
          );
          const dy = pointer.y - top;
          goal =
            SLOWEST +
            (1 - SLOWEST) * smoothstep(NEAR_PX, FAR_PX, Math.hypot(dx, dy));
        }
        speeds[i]! += (goal - speeds[i]!) * Math.min(1, dt * EASE);
        clocks[i]! += dt * speeds[i]!;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      for (const [type, fn] of listeners) el.removeEventListener(type, fn);
      el.removeEventListener("wheel", onWheel);
      resetRef.current = () => {};
    };
    // The motion only changes when the people do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, zoomable]);

  const reset = useCallback(() => resetRef.current(), []);
  return { box, reset };
}

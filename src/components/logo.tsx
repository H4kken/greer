import { cn } from "@/lib/utils";

// The sprout: two leaves on a stem, like a topic that took root. Drawn in
// the theme's green, so it follows light and dark mode. The browser tab
// and the README use the same drawing (src/app/icon.svg).
export function SproutMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className={cn("shrink-0 fill-primary stroke-primary", className)}
    >
      <path d="M24 43V23" fill="none" strokeWidth="3.6" strokeLinecap="round" />
      <path
        d="M24 31C14 31 8.5 24.5 8.5 16.5 17.5 16.5 24 22 24 31Z"
        stroke="none"
        opacity="0.7"
      />
      <path
        d="M24 24.5C33.5 24.5 39.5 18 39.5 9.5 30 9.5 24 15.5 24 24.5Z"
        stroke="none"
      />
    </svg>
  );
}

// Greer's mark and name, used in every header.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 font-heading text-2xl font-semibold tracking-tight",
        className,
      )}
    >
      <SproutMark className="size-7" />
      Greer
    </span>
  );
}

// Dates for the UI. Computed on the server so the client renders the same text.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "just now", "5 min ago", "3h ago", "2d ago", then "Sep 13".
export function formatRelative(date: Date, now = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(date.getUTCFullYear() !== now.getUTCFullYear() && { year: "numeric" }),
  });
}

// For hover titles: "Sep 13, 2026, 14:05 UTC".
export function formatAbsolute(date: Date): string {
  return `${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;
}

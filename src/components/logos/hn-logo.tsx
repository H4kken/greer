import { cn } from "@/lib/utils";

// Hacker News' orange "Y" square, drawn here. Only used to label the HN
// connection, next to the name "Hacker News".
export function HnLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="6" fill="#ff6600" />
      <path d="M9 8h3.2L16 15.4 19.8 8H23l-5.4 9.6V24h-3.2v-6.4Z" fill="#fff" />
    </svg>
  );
}

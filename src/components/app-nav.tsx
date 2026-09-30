"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/explore", label: "Explore" },
  { href: "/people", label: "People" },
  { href: "/accounts", label: "Accounts" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    // On phones the links scroll sideways rather than widen the page.
    <nav aria-label="Main" className="min-w-0 overflow-x-auto">
      <ul className="flex items-center gap-3 py-1 text-sm whitespace-nowrap sm:gap-4">
        {LINKS.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "hover:text-foreground",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

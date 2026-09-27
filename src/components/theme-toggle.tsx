"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

type ThemeValue = (typeof THEMES)[number]["value"];

// The chosen theme is only known in the browser (next-themes keeps it in
// localStorage), so render a neutral placeholder on the server.
const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function useThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[2];
  return { mounted, current, setTheme };
}

// Header: an icon button with a Light / Dark / System menu.
export function ThemeMenu() {
  const { mounted, current, setTheme } = useThemeChoice();
  const Icon = mounted ? current.Icon : MonitorIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={mounted ? `Theme: ${current.label}` : "Theme"}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        <Icon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup
          value={mounted ? current.value : undefined}
          onValueChange={(value) => setTheme(value as ThemeValue)}
        >
          {THEMES.map(({ value, label, Icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <ItemIcon aria-hidden /> {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Settings: the same choice as a labeled segmented control (native radios).
export function ThemeChoice() {
  const { mounted, current, setTheme } = useThemeChoice();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Theme</legend>
      <div className="flex w-fit rounded-lg border bg-card p-0.5">
        {THEMES.map(({ value, label, Icon }) => {
          const checked = mounted && current.value === value;
          return (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked
                  ? "bg-primary-soft font-medium text-primary-soft-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={checked}
                onChange={() => setTheme(value)}
                className="sr-only"
              />
              <Icon aria-hidden className="size-4" />
              {label}
            </label>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        System follows your device&apos;s setting. Saved in this browser.
      </p>
    </fieldset>
  );
}

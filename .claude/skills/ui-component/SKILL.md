---
name: ui-component
description: Build, change or review UI with Tailwind CSS v4 and shadcn/ui, following Greer's UX and accessibility standards (pages, inbox, forms, dialogs, settings, onboarding). Use for any work in src/app or src/components.
---

# UI/UX with Tailwind v4 + shadcn/ui

## Building

1. **Use shadcn first.** Before building a primitive, check whether shadcn has it. Add it with `pnpm dlx shadcn@latest add <component>`; it lands in `src/components/ui/`. Compose it in `src/components/<feature>/` rather than heavily editing the generated files.
2. **Styling:** Tailwind utility classes only. There are no CSS modules or extra stylesheets. Theme tokens (colors, radius, fonts) live in `src/app/globals.css` under `@theme` / the shadcn CSS variables. Use semantic tokens (`bg-background`, `text-muted-foreground`, `border`) instead of raw colors so dark mode keeps working. Merge classes with `cn()` from `src/lib/utils.ts`. Prettier sorts class names; don't reorder by hand.
3. **Forms:** shadcn `Form` + react-hook-form + the same zod schema the server action uses.
4. **Data:** fetch in server components; keep client components small and interactive-only.

## UX standards (check every screen against these)

**States.** Each view designs its loading (skeletons shaped like the content, not spinners), empty (says what goes here and gives the next action, e.g. "No threads yet. Add a keyword"), error (what happened + how to fix it + retry), and partial states (e.g. one source failing while others work).

**Feedback.**
- Every action responds within 100 ms. Use `useOptimistic` / `useTransition` for triage actions.
- Toasts confirm background results.
- Buttons show a pending state and can't be double-submitted.

**Forgiving.**
- Dismiss, snooze and delete are undoable (toast with "Undo") rather than hidden behind confirmation dialogs.
- Keep confirmation dialogs for actions that really can't be undone, and name the consequence ("Delete 240 items").

**Speed for daily use.** The inbox is a triage tool you use every day:
- keyboard-first: j/k to move, d to dismiss, s to snooze, r to open the brief + editor, `?` shows the shortcuts;
- the next item is focused automatically after an action;
- stays fast at 1000+ items (pagination or virtualization).

**Clarity.**
- Every surfaced thread says *why* it was surfaced (score reason, matched keyword).
- The brief and community rules sit next to the editor; the editor autosaves.
- The brief is notes, not text: no "copy brief" or "insert into reply" buttons. Only the user's own reply can be copied.
- Community rules are always visible while writing. Relative times ("3h ago") show the absolute time on hover.
- Copy is plain and specific: no jargon, no "Oops!".

**Trust.**
- Make it obvious that Greer never posts. The primary action says "Copy & open thread", not "Reply".
- Show LLM usage and cost estimates where the user configures models.

**Progressive onboarding.**
- The first run gets to a filled inbox in under 5 minutes.
- Start from smart defaults (suggested keywords and communities) and let people edit them later, instead of requiring everything upfront.

## Accessibility (WCAG 2.2 AA)

- Semantic HTML first. Every interactive element can be reached and used by keyboard, with a visible focus ring (don't remove `focus-visible` styles).
- Labels on every input. Icon-only buttons get `aria-label`. Status changes are announced (toasts use a live region; shadcn/sonner handles this).
- Contrast ≥ 4.5:1 for text in both themes. Don't rely on color alone: scores and statuses also have a label or icon.
- Respect `prefers-reduced-motion`. Targets are at least 24×24 px.

## Responsive

Design desktop-first (triage happens at a desk) but make it fully usable at 375 px: the inbox and reply panels stack, there is no horizontal scrolling, and touch targets grow to 44 px.

## Done checklist

- [ ] All states designed (loading / empty / error / success)
- [ ] Works by keyboard only, with visible focus
- [ ] Light + dark mode, 375 px and desktop checked
- [ ] Playwright + axe test covers the flow (see the `write-tests` skill)
- [ ] `pnpm format && pnpm lint && pnpm typecheck` pass

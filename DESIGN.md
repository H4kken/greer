# Design

How Greer looks and why. Read this before building UI. The how-to for building (shadcn/ui, Tailwind, states, accessibility) is in the [`ui-component` skill](.claude/skills/ui-component/SKILL.md); the tokens themselves are in [`src/app/globals.css`](src/app/globals.css).

## The idea: a notebook, not a dashboard

Greer is a daily 10–15 minute triage of real conversations. The design stays quiet so the threads are what you read:

- **Calm over busy.** Paper background, soft borders, no shadows, no gradients, no illustrations. Nothing blinks or celebrates.
- **Green means "act here".** The forest accent marks primary actions, the current selection and focus, and nothing decorative.
- **Reading is serif, doing is sans.** Headings and thread titles use a serif, so conversations read like something a person wrote. Controls, forms and meta lines use a sans.
- **Numbers are mono.** Scores, counts, times and keyboard hints use a monospace font, so they line up and are easy to scan.

## Color

Use the semantic tokens (Tailwind classes such as `bg-card` or `text-muted-foreground`), never raw hex values in components. Every token has a light and a dark value, so dark mode works automatically.

| Token                                      | Light                 | Dark                  | Use for                                                               |
| ------------------------------------------ | --------------------- | --------------------- | --------------------------------------------------------------------- |
| `background`                               | `#f7f5f0`             | `#151311`             | the page ("paper")                                                    |
| `card`                                     | `#fffdf9`             | `#1c1a17`             | surfaces on the page: lists, the thread panel, info boxes             |
| `foreground`                               | `#1c1917`             | `#f3f0ea`             | body text and headings ("ink")                                        |
| `muted-foreground`                         | `#57534e`             | `#a8a29e`             | meta lines, help text, secondary labels                               |
| `muted`                                    | `#f0ede6`             | `#262320`             | quoted content (the post), quiet panels                               |
| `accent`                                   | `#efeae1`             | `#2a2723`             | hover backgrounds                                                     |
| `border` / `input`                         | `#e7e3da` / `#d9d4c9` | `#34302b` / `#3d3832` | dividers, card outlines / form fields                                 |
| `primary`                                  | `#2f6b4f`             | `#7fc4a0`             | primary buttons, links, focus rings, check marks                      |
| `primary-hover`                            | `#23513c`             | `#9dd3b6`             | primary button hover (never a see-through primary: it fails contrast) |
| `primary-soft` + `primary-soft-foreground` | `#e6efe9` + `#1f4a37` | `#1f3329` + `#b9e0ca` | the selected view, the selected thread (at 50%), score chips          |
| `destructive`                              | `#b42318`             | `#f97066`             | errors and destructive actions only                                   |

Rules:

- **One primary action per view.** Other buttons are `outline` or `ghost`.
- **Selection is `primary-soft`, hover is `accent`.** Don't use `muted` for either: it's for content.
- **Don't rely on color alone.** Scores show a number and the criteria; statuses have a label or an icon.
- **Contrast is checked:** every text/background pair above passes WCAG AA (4.5:1); the lowest is about 6.3:1. If you add a token, check its pairs and note it in `globals.css`.

## Typography

| Role                        | Font                | Classes                                      |
| --------------------------- | ------------------- | -------------------------------------------- |
| Page title (`h1`)           | Newsreader, medium  | `text-3xl font-medium tracking-tight`        |
| Section title (`h2`, `h3`)  | Newsreader, medium  | `text-xl` / `text-lg font-medium`            |
| Thread titles (list)        | Newsreader, regular | `font-heading text-[1.0625rem] leading-snug` |
| Thread title (panel)        | Newsreader, medium  | `text-3xl leading-tight font-medium`         |
| Body, controls, labels      | Geist               | default (`font-sans`), `text-sm` in dense UI |
| Meta lines                  | Geist               | `text-xs text-muted-foreground`              |
| Scores, counts, times, keys | Geist Mono          | `font-mono`                                  |
| Small uppercase labels      | Geist               | `font-sans text-xs tracking-wider uppercase` |

- `h1`–`h3` are serif by default (`globals.css`). Add `font-sans` to a heading that is really a label, e.g. the "Keywords" sidebar label.
- Serif headings use `font-medium`, never `font-bold`: the calm comes from weight as much as from color.
- The fonts load with `next/font` in [`src/app/layout.tsx`](src/app/layout.tsx), so no extra requests reach Google at runtime.

## Shape and space

- **Radius:** `rounded-lg` (12 px) for controls and nav items, `rounded-xl` for lists and info boxes, `rounded-2xl` for large surfaces (thread panel, empty states). Chips are `rounded-full`.
- **Borders, not shadows.** Surfaces are `bg-card` with a 1 px `border`. Empty and placeholder areas use a dashed border.
- **Spacing:** multiples of 4 px; `gap-*` on flex and grid containers rather than margins. Pages get `px-4 py-6` to `py-8`; panels `p-5` to `p-6`.
- **Widths:** the inbox uses the full screen (up to `max-w-screen-2xl`); settings and onboarding read best at `max-w-5xl`, with forms at `max-w-xl`.

## Components and patterns

- **Score chip** ([`score-badge.tsx`](src/components/score-badge.tsx)): `92 · 4/5` in mono on `primary-soft`. Always show the criteria next to the score.
- **Selected item:** `bg-primary-soft` (nav) or `bg-primary-soft/50` (list rows, where the score chip sits on top), plus `aria-current`.
- **Quoted content** (the post, a comment): `bg-muted rounded-xl p-4`, slightly larger text with relaxed leading.
- **Empty states:** dashed `rounded-2xl` box, a serif title that says what's going on ("All caught up"), one line of explanation, and the next action as a button.
- **Alerts:** only for things the user should act on (worker down, key missing, searches failing). Say what happened and how to fix it.
- **Icons:** lucide, `aria-hidden` next to text; icon-only buttons get an `aria-label`.

## Voice

- Plain, specific and calm. "Couldn't reach Hacker News for 2 searches", not "Oops! Something went wrong".
- Talk about the user's work, not the tool's cleverness: no "AI-powered", no exclamation marks, no streaks or confetti.
- Make trust visible: say that Greer only reads and never posts wherever the user might wonder about it.

## Dark mode

Dark mode follows the system setting and uses the same tokens. It isn't an inverted light mode: the background is a warm near-black, the accent is a lighter green that keeps its contrast, and `primary-soft` is a deep green. Check new screens in both themes; the e2e suite runs axe on the inbox in dark mode at phone width.

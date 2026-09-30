// The platforms Greer can connect to, in the order they're shown. Adding one
// means a source adapter, an entry here and its connect card. Only Hacker News
// for now: see PLAN.md, "Other platforms (parked)".
export const PLATFORMS = [
  {
    id: "hn",
    name: "Hacker News",
    about: "Reads your public profile and replies. No password needed.",
  },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

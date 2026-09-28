// The platforms Greer can connect to, in the order they're shown. Adding one
// (Reddit, X) means a source adapter, an entry here and its connect card.
export const PLATFORMS = [
  {
    id: "hn",
    name: "Hacker News",
    available: true,
    about: "Reads your public profile and replies. No password needed.",
  },
  {
    id: "reddit",
    name: "Reddit",
    available: false,
    about: "Will use your own approved Reddit API credentials.",
  },
  {
    id: "x",
    name: "X",
    available: false,
    about: "Will need your own X API access.",
  },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

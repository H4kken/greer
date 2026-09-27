// Spike configuration: Greer dogfooding itself. Edit freely between runs.

export const PRODUCT = {
  name: "Greer",
  pitch:
    "Open-source, self-hostable tool that helps small or new SaaS builders create a genuine community " +
    "and get feedback on their product. It finds conversations where the builder can genuinely help, " +
    "gives them short reply ideas (never AI-written replies), and tracks the relationships over time.",
  audience:
    "Indie hackers, solo founders and small teams building a SaaS, especially early-stage ones " +
    "(pre-launch, MVP, first customers) who struggle with outreach and building an audience.",
  problems: [
    "finding and getting the first users or first paying customers",
    "doing outreach without being spammy",
    "getting feedback on an MVP, demo or launch",
    "building a community or audience from zero",
    "launching (Show HN, Product Hunt) and getting no traction",
  ],
  founderStory:
    "I sucked at creating a community, so I built this tool to help people create their own.",
};

export type Query = {
  label: string;
  query: string; // words, all required (Algolia); empty = everything matching tags
  tags: string; // Algolia tags filter, e.g. "(story,comment)", "ask_hn", "show_hn"
  days?: number; // overrides the global --days
};

// Word queries, not quoted phrases: quoted phrases were far too narrow when tested
// ("first customers" quoted: 2 hits in 30 days vs 323 unquoted).
export const QUERIES: Query[] = [
  {
    label: "first customers",
    query: "first customers",
    tags: "(story,comment)",
  },
  { label: "first users", query: "first users", tags: "(story,comment)" },
  { label: "first paying", query: "first paying", tags: "(story,comment)" },
  { label: "cold outreach", query: "cold outreach", tags: "(story,comment)" },
  { label: "no traction", query: "no traction", tags: "(story,comment)" },
  {
    label: "build in public",
    query: "build in public",
    tags: "(story,comment)",
  },
  { label: "mvp feedback", query: "mvp feedback", tags: "(story,comment)" },
  { label: "launched saas", query: "launched saas", tags: "(story,comment)" },
  { label: "saas community", query: "saas community", tags: "(story,comment)" },
  { label: "Ask HN: users", query: "users", tags: "ask_hn" },
  { label: "Ask HN: customers", query: "customers", tags: "ask_hn" },
  { label: "Ask HN: marketing", query: "marketing", tags: "ask_hn" },
  { label: "Ask HN: launch", query: "launch", tags: "ask_hn" },
  { label: "Show HN: feedback", query: "feedback", tags: "show_hn", days: 7 },
];

export const MODELS = {
  score: "claude-haiku-4-5", // cheap, high-volume relevance scoring
  brief: "claude-opus-5", // judgment-heavy reply briefs, a few per run
} as const;

// USD per million tokens (input, output), for the cost estimate printed at the end.
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5": { input: 5, output: 25 },
};

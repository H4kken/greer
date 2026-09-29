import type { AiJob, AiProviderName } from "@/llm/config";

// Words for the AI settings, shared by the card (server) and the form (client).

export const PROVIDER_NAMES: Record<AiProviderName | "mock", string> = {
  typesafe: "TypeSafe Jev",
  anthropic: "Claude",
  openai: "OpenAI",
  ollama: "Ollama",
  mock: "Mock (test mode)",
};

export const PROVIDER_OPTIONS: Record<AiProviderName, string> = {
  typesafe: "TypeSafe Jev (recommended)",
  anthropic: "Claude (Anthropic)",
  openai: "OpenAI or compatible",
  ollama: "Ollama (runs on your machine)",
};

// Why pick this provider for this job, in one line.
export const PROVIDER_HINTS: Record<
  AiJob,
  Partial<Record<AiProviderName, string>>
> = {
  sorting: {
    typesafe:
      "Made for quick yes/no judgments: about 5 cents per 1,000 threads, a quarter of a second each.",
    anthropic:
      "Claude Haiku by default: about $1.30 per 1,000 threads. Your Claude key can do writing help too.",
    openai: "Pick a small, fast model.",
    ollama: "Free, as fast as your hardware. Pick a small model.",
  },
  writing: {
    anthropic: "Claude Sonnet by default: a few cents a day.",
    openai: "Pick a mid-size model that reasons well.",
    ollama: "Free. Pick the largest model your machine runs comfortably.",
  },
};

export const KEY_LINKS: Partial<
  Record<AiProviderName, { href: string; text: string }>
> = {
  typesafe: {
    href: "https://console.typesafe.ai/",
    text: "Get a key in the TypeSafe console",
  },
  anthropic: {
    href: "https://console.anthropic.com/settings/keys",
    text: "Get a key in the Anthropic console",
  },
  openai: {
    href: "https://platform.openai.com/api-keys",
    text: "Get a key from OpenAI",
  },
};

export const JOBS: Record<
  AiJob,
  { title: string; why: string; whenMissing: string }
> = {
  sorting: {
    title: "Sorting threads",
    why: "Reads every new thread, often hundreds a day, and decides whether you could help. Today depends on it. A fast, low-cost model is best.",
    whenMissing:
      "Not set: threads are collected but wait until you pick a model.",
  },
  writing: {
    title: "Writing help",
    why: "Suggests keywords, reads the answers to your replies, and will suggest reply ideas. It only runs on the threads you care about, so a mid-size model that reasons well is worth its few cents.",
    whenMissing:
      "Not set: keyword suggestions and reading answers are off. Sorting still works.",
  },
};

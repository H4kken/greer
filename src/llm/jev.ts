// Scoring threads with TypeSafe's Jev (https://docs.typesafe.ai), a model
// that answers typed questions (yes/no, pick one) with probabilities instead
// of generating text: the preferred sorting model (see config.ts). `pnpm eval jev`
// compares it with the LLM scorer on accuracy, speed and cost.
//
// Same criteria as score-help / score-launch, asked as separate questions,
// with one yes/no question per problem. Scores combine the probabilities in
// code, with the same weights as src/scoring/compute.ts. Bump the version
// below whenever a question changes, as for prompts.
import type { ScoreHelpOutput } from "./prompts/score-help";
import type { ItemForScoring, ProductProfile } from "./prompts/shared";

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
// USD per million input tokens; output tokens are free.
export const JEV_PRICE_PER_MTOK = 0.042;
export const JEV_HELP_VERSION = "jev-help-v2";
export const JEV_LAUNCH_VERSION = "jev-launch-v1";
const TIMEOUT_MS = 30_000;

// A failed call. `status` is the HTTP status, or null for a network error
// or timeout; 401/403 mean the key is wrong.
export class JevError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "JevError";
  }
  get badKey() {
    return this.status === 401 || this.status === 403;
  }
}

type Noul = {
  type: "noul";
  instructions: string | Record<string, unknown>;
  criteria?: { true: string; false: string };
};
type Choice = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};
export type JevQuestion = Noul | Choice;

export type JevAnswer =
  | { type: "noul"; noul: number }
  | {
      type: "choice";
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    };

// Everything the questions refer to, by name. Post text is untrusted; Jev
// only answers the questions below, so there is nothing for it to follow.
export function jevState(product: ProductProfile, item: ItemForScoring) {
  return {
    builder: {
      product: product.name,
      what_it_does: product.description,
      audience: product.audience,
    },
    post: {
      kind:
        item.type === "comment"
          ? "A comment in a Hacker News thread"
          : "A Hacker News post",
      thread_title: item.title,
      text: (item.text || "(no text, title only)").slice(0, 4000),
    },
  };
}

const INTENTS = {
  asking_for_help: "The author asks for help, advice or feedback",
  describing_pain: "The author describes a struggle without asking directly",
  sharing_launch: "The author shares something they launched or built",
  discussion: "General discussion, news or opinions",
  other: "Anything else",
};

export function helpQuestions(
  product: ProductProfile,
): Record<string, JevQuestion> {
  const problems = Object.fromEntries(
    product.problems.map((problem, i) => [
      `problem_${i}`,
      {
        type: "noul",
        instructions: {
          problem,
          question:
            "Is the author of `post` personally facing `problem` right now?",
        },
        criteria: {
          true: "The author's own situation is this problem",
          false:
            "Not their problem: only mentioned in passing, about someone else, or a keyword coincidence (e.g. 'first users' of a programming language)",
        },
      } satisfies Noul,
    ]),
  );
  return {
    own_situation: {
      type: "noul",
      instructions:
        "Is the author of `post` writing about their own product, project or career, which is at stake for them?",
      criteria: {
        true: "They describe something they build, run or go through themselves, even if phrased generally",
        false: "News, opinions, general topics, or someone else's company",
      },
    },
    seeking_help: {
      type: "noul",
      instructions:
        "Does the author of `post` ask for help, advice or feedback?",
      criteria: {
        true: "Asks explicitly, or clearly wants input",
        false: "Only shares, announces or comments",
      },
    },
    specific: {
      type: "noul",
      instructions:
        "Does `post` give concrete details (their product, numbers, what they already tried)?",
      criteria: {
        true: "Enough detail for a specific answer",
        false: "Vague; only generic advice would fit",
      },
    },
    reply_welcome: {
      type: "noul",
      instructions:
        "Would a thoughtful reply from a fellow builder be welcome under `post`?",
      criteria: {
        true: "Open, unresolved, inviting answers",
        false: "Hostile, already resolved or rhetorical",
      },
    },
    // Who they are, apart from what they ask: someone who could become a
    // user (a carrot) or someone to help in public (a dandelion). Not part
    // of the score.
    author_in_audience: {
      type: "noul",
      instructions:
        "Is the author of `post` themself one of the people described in `builder.audience`?",
      criteria: {
        true: "The author matches that description",
        false:
          "The author doesn't match it (e.g. an employee of a large company, a hobbyist, an investor), even if their question relates",
      },
    },
    intent: {
      type: "choice",
      instructions: "What is the author of `post` doing?",
      criteria: INTENTS,
    },
    ...problems,
  };
}

// Jev reads questions literally (see its "jaggedness" notes), so the LLM's
// single "maker in audience" judgment is split in two literal questions: is
// the maker one of the builder's audience, and do they want users at all.
export function launchQuestions(): Record<string, JevQuestion> {
  return {
    asks_for_feedback: {
      type: "noul",
      instructions:
        "Does the maker of `post` invite people to respond: feedback, questions, reactions, or to try it and say what they think?",
      criteria: {
        true: "Any invitation to respond or to try it, explicit or clearly implied",
        false: "Only announces or describes, with no invitation",
      },
    },
    early_stage: {
      type: "noul",
      instructions: "Is the product in `post` early-stage?",
      criteria: {
        true: "New: an MVP, a first launch, recently released, few or no users",
        false:
          "Running for years, an established company, or a new version of a well-known project",
      },
    },
    maker_in_audience: {
      type: "noul",
      instructions:
        "Is the maker of `post` themself one of the people described in `builder.audience`?",
      criteria: {
        true: "The maker matches that description",
        false:
          "The maker doesn't match it (e.g. a funded or established company, someone posting for their employer), even if their product's users might",
      },
    },
    wants_users: {
      type: "noul",
      instructions:
        "Is the maker of `post` trying to get people to use, sign up for or buy what they made?",
      criteria: {
        true: "A product or service they want users or customers for",
        false:
          "An experiment, learning project, hobby game, guide, collection, or something built only for themselves",
      },
    },
    useful_feedback_possible: {
      type: "noul",
      instructions:
        "Could a fellow builder give concrete, useful feedback from `post` alone?",
    },
  };
}

type Answers = Record<string, JevAnswer>;

const noul = (a: Answers, key: string): number => {
  const x = a[key];
  if (x?.type !== "noul") throw new Error(`Jev answer ${key} is missing`);
  return x.noul;
};

const MATCH_LEVELS: [number, ScoreHelpOutput["problem_match"]][] = [
  [0.8, "strong"],
  [0.6, "clear"],
  [0.4, "weak"],
];

const CAP = 40;

// Help thread: probabilities weighted like computeHelpScore, so a thread
// the model is unsure about lands between the two scores it could get.
export function jevHelpScore(a: Answers, problemCount: number) {
  const problems = Array.from({ length: problemCount }, (_, i) =>
    noul(a, `problem_${i}`),
  );
  const best = Math.max(0, ...problems);
  const intent = a.intent?.type === "choice" ? a.intent : null;
  const p = {
    own: noul(a, "own_situation"),
    seeking: noul(a, "seeking_help"),
    specific: noul(a, "specific"),
    welcome: noul(a, "reply_welcome"),
  };
  const raw =
    20 * p.own + 20 * p.seeking + 30 * best + 20 * p.specific + 10 * p.welcome;
  const target = Math.max(
    p.seeking,
    intent?.probabilities.describing_pain ?? 0,
  );
  const score = Math.round(target >= 0.5 ? raw : Math.min(raw, CAP));

  // The same criteria the LLM returns, so "why Greer surfaced this" works.
  const matched = best > 0 ? problems.indexOf(best) : -1;
  const criteria: Omit<ScoreHelpOutput, "reason"> = {
    own_situation: p.own >= 0.5,
    seeking_help: p.seeking >= 0.5,
    problem_match: MATCH_LEVELS.find(([min]) => best >= min)?.[1] ?? "none",
    matched_problem: best >= 0.4 && matched >= 0 ? matched + 1 : null,
    specific: p.specific >= 0.5,
    reply_welcome: p.welcome >= 0.5,
    author_in_audience: noul(a, "author_in_audience") >= 0.5,
    intent: (intent?.choice ?? "other") as ScoreHelpOutput["intent"],
  };
  return { score, criteria, problems };
}

export function jevLaunchScore(a: Answers) {
  const p = {
    asks: noul(a, "asks_for_feedback"),
    early: noul(a, "early_stage"),
    // Both halves of "a maker in the builder's audience" must hold.
    audience: Math.min(noul(a, "maker_in_audience"), noul(a, "wants_users")),
    useful: noul(a, "useful_feedback_possible"),
  };
  const raw = 30 * p.asks + 20 * p.early + 30 * p.audience + 20 * p.useful;
  const score = Math.round(p.audience >= 0.5 ? raw : Math.min(raw, CAP));
  const criteria = {
    asks_for_feedback: p.asks >= 0.5,
    early_stage: p.early >= 0.5,
    maker_in_audience: p.audience >= 0.5,
    useful_feedback_possible: p.useful >= 0.5,
  };
  return { score, criteria };
}

export type JevResult = {
  answers: Answers;
  model: string;
  inputTokens: number;
  ms: number;
};

// One request: the state plus every question, answered in parallel.
export async function askJev(
  apiKey: string,
  state: unknown,
  questions: Record<string, JevQuestion>,
  model = JEV_MODEL,
): Promise<JevResult> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(JEV_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state, model, questions }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new JevError(`Jev unreachable: ${(error as Error).message}`, null);
    }
    // Rate limited: wait as told, a few times, then give up (the job retries).
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
      continue;
    }
    if (!res.ok) {
      throw new JevError(
        `Jev ${res.status}: ${(await res.text()).slice(0, 300)}`,
        res.status,
      );
    }
    const body = (await res.json()) as {
      model: string;
      answers: Answers;
      usage: { input_tokens: number };
    };
    return {
      answers: body.answers,
      model: body.model,
      inputTokens: body.usage.input_tokens,
      ms: Date.now() - started,
    };
  }
}

// A one-question call made before saving a key, so a wrong key is caught in
// the form rather than by the worker later. Costs a fraction of a cent.
export async function checkJevKey(
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await askJev(apiKey, "Hello", {
      greeting: { type: "noul", instructions: "Is this a greeting?" },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof JevError && error.badKey) {
      return { ok: false, error: "TypeSafe rejected this key." };
    }
    return { ok: false, error: (error as Error).message.slice(0, 200) };
  }
}

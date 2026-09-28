// Labels how someone answered the user. The model gives yes/no signals; code
// picks the one tone shown in the UI, so the rule can change without asking
// the model again.
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { reply, replyAnswer } from "@/db/schema";
import { generateStructured } from "@/llm/client";
import {
  type ClassifyAnswerOutput,
  classifyAnswer,
} from "@/llm/prompts/classify-answer";

export type AnswerTone = "question" | "thanks" | "disagreement" | "neutral";

// A question wins: it's a conversation waiting for the user. Thanks comes
// before disagreement, so "thanks, but…" still reads as a good moment.
export function toneOf(o: ClassifyAnswerOutput): AnswerTone {
  if (o.asks_builder) return "question";
  if (o.thanks) return "thanks";
  if (o.disagrees) return "disagreement";
  return "neutral";
}

export async function classifyReplyAnswer(
  db: Db,
  answerId: string,
): Promise<{ status: "classified"; tone: AnswerTone } | { status: "skipped" }> {
  const [row] = await db
    .select({ answer: replyAnswer, reply })
    .from(replyAnswer)
    .innerJoin(reply, eq(reply.id, replyAnswer.replyId))
    .where(eq(replyAnswer.id, answerId));
  if (!row) return { status: "skipped" };

  const { output, model } = await generateStructured(
    row.answer.workspaceId,
    classifyAnswer,
    {
      threadTitle: row.reply.threadTitle,
      reply: row.reply.text,
      answer: row.answer.text,
    },
  );
  const tone = toneOf(output);
  await db
    .update(replyAnswer)
    .set({
      tone,
      thanked: output.thanks,
      asked: output.asks_builder,
      disagreed: output.disagrees,
      toneReason: output.reason,
      promptVersion: classifyAnswer.version,
      model,
      classifiedAt: new Date(),
    })
    .where(eq(replyAnswer.id, answerId));
  return { status: "classified", tone };
}

// Answers the model hasn't read yet, e.g. while no AI model was set.
export async function unclassifiedAnswerIds(
  db: Db,
  { workspaceId, limit = 200 }: { workspaceId?: string; limit?: number } = {},
): Promise<string[]> {
  const rows = await db
    .select({ id: replyAnswer.id })
    .from(replyAnswer)
    .where(
      and(
        isNull(replyAnswer.tone),
        workspaceId ? eq(replyAnswer.workspaceId, workspaceId) : undefined,
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}

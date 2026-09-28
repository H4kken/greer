"use server";
// People actions. Each one checks the session and only touches the user's
// workspace.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireWorkspace } from "@/lib/session";
import { hnHandleSchema } from "@/workspace/schemas";
import { setTriedProduct } from "./queries";

type Result = { ok: true } | { ok: false; error: string };

export async function setTriedProductAction(
  handle: unknown,
  tried: unknown,
): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const h = hnHandleSchema.safeParse(handle);
  const t = z.boolean().safeParse(tried);
  if (!h.success || !t.success) return { ok: false, error: "Invalid input." };
  await setTriedProduct(db, workspace.id, "hn", h.data, t.data);
  revalidatePath("/people");
  return { ok: true };
}

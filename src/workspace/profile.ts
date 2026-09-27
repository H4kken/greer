import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { workspace } from "@/db/schema";
import type { productProfileSchema } from "./schemas";
import type { z } from "zod";

export type ProductProfileValues = z.output<typeof productProfileSchema>;

export async function getProductProfile(
  db: Db,
  workspaceId: string,
): Promise<ProductProfileValues | null> {
  const [row] = await db
    .select({
      productName: workspace.productName,
      productDescription: workspace.productDescription,
      audience: workspace.audience,
      problems: workspace.problems,
    })
    .from(workspace)
    .where(eq(workspace.id, workspaceId));
  if (!row?.productName || !row.productDescription) return null;
  return {
    productName: row.productName,
    productDescription: row.productDescription,
    audience: row.audience ?? "",
    problems: row.problems,
  };
}

export async function saveProductProfile(
  db: Db,
  workspaceId: string,
  profile: ProductProfileValues,
): Promise<void> {
  await db
    .update(workspace)
    .set({ ...profile, audience: profile.audience || null })
    .where(eq(workspace.id, workspaceId));
}

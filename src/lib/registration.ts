import { asc, count } from "drizzle-orm";
import { db } from "@/db";
import { user, workspace, workspaceMember } from "@/db/schema";

// The first account becomes the owner; after that, registration is closed
// unless ALLOW_REGISTRATION=true. Read at call time so it can change without a rebuild.
export async function isRegistrationOpen(): Promise<boolean> {
  if (process.env.ALLOW_REGISTRATION === "true") return true;
  return !(await hasAnyUser());
}

export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(user);
  return (row?.n ?? 0) > 0;
}

// Single-workspace instance: the first user creates it and owns it,
// everyone after joins it as a member.
export async function addUserToWorkspace(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: workspace.id })
      .from(workspace)
      .orderBy(asc(workspace.createdAt))
      .limit(1);

    if (existing) {
      await tx
        .insert(workspaceMember)
        .values({ workspaceId: existing.id, userId, role: "member" })
        .onConflictDoNothing();
      return;
    }

    const [created] = await tx
      .insert(workspace)
      .values({ name: "My workspace" })
      .returning({ id: workspace.id });
    await tx
      .insert(workspaceMember)
      .values({ workspaceId: created!.id, userId, role: "owner" });
  });
}

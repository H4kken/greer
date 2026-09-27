import { count } from "drizzle-orm";
import { db } from "@/db";
import { user, workspace, workspaceMember } from "@/db/schema";

// Anyone can create the first account; after that, registration is closed
// unless ALLOW_REGISTRATION=true. Read at call time so it can change without a rebuild.
export async function isRegistrationOpen(): Promise<boolean> {
  if (process.env.ALLOW_REGISTRATION === "true") return true;
  return !(await hasAnyUser());
}

export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(user);
  return (row?.n ?? 0) > 0;
}

// Users and workspaces are separate: every new account gets its own
// workspace and owns it. workspace_member is many-to-many, so a user can
// later belong to several workspaces (invites, a workspace switcher).
export async function createWorkspaceForUser(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(workspace)
      .values({ name: "My workspace" })
      .returning({ id: workspace.id });
    await tx
      .insert(workspaceMember)
      .values({ workspaceId: created!.id, userId, role: "owner" });
  });
}

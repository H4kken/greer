import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { workspace, workspaceMember } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

// For pages and server actions that need a signed-in user.
// The proxy only checks that a cookie exists; this validates the session.
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

export async function getWorkspaceForUser(userId: string) {
  const [row] = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      role: workspaceMember.role,
      onboardedAt: workspace.onboardedAt,
    })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(eq(workspaceMember.userId, userId))
    .orderBy(asc(workspace.createdAt))
    .limit(1);
  return row ?? null;
}

// For pages and server actions that act on the user's workspace.
export async function requireWorkspace() {
  const session = await requireSession();
  const ws = await getWorkspaceForUser(session.user.id);
  if (!ws) throw new Error("This account has no workspace.");
  return { session, workspace: ws };
}

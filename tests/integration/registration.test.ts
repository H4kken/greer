import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user, workspaceMember } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isRegistrationOpen } from "@/lib/registration";
import { getWorkspaceForUser } from "@/lib/session";
import { truncateAll } from "../helpers/truncate";

const password = "correct horse battery";

function signUp(email: string) {
  return auth.api.signUpEmail({
    body: { name: email.split("@")[0]!, email, password },
  });
}

describe("registration", () => {
  beforeEach(truncateAll);
  afterEach(() => {
    process.env.ALLOW_REGISTRATION = "false";
  });

  it("makes the first account the owner of a new workspace", async () => {
    const { user: owner } = await signUp("owner@example.com");

    const ws = await getWorkspaceForUser(owner.id);
    expect(ws).toMatchObject({ name: "My workspace", role: "owner" });
  });

  it("closes registration once an account exists", async () => {
    expect(await isRegistrationOpen()).toBe(true);
    await signUp("owner@example.com");
    expect(await isRegistrationOpen()).toBe(false);

    await expect(signUp("stranger@example.com")).rejects.toThrow(
      /Registration is closed/,
    );
    const users = await db.select().from(user);
    expect(users.map((u) => u.email)).toEqual(["owner@example.com"]);
  });

  it("gives each new account its own workspace when ALLOW_REGISTRATION=true", async () => {
    const { user: first } = await signUp("first@example.com");
    process.env.ALLOW_REGISTRATION = "true";
    const { user: second } = await signUp("second@example.com");

    const firstWs = await getWorkspaceForUser(first.id);
    const secondWs = await getWorkspaceForUser(second.id);
    expect(secondWs).toMatchObject({ role: "owner" });
    expect(secondWs!.id).not.toBe(firstWs!.id);

    // Each workspace has exactly one member: its owner.
    for (const ws of [firstWs!, secondWs!]) {
      const members = await db
        .select()
        .from(workspaceMember)
        .where(eq(workspaceMember.workspaceId, ws.id));
      expect(members).toHaveLength(1);
    }
  });

  it("picks the user's own workspace over ones they only belong to", async () => {
    const { user: first } = await signUp("first@example.com");
    process.env.ALLOW_REGISTRATION = "true";
    const { user: second } = await signUp("second@example.com");
    const firstWs = await getWorkspaceForUser(first.id);
    const ownWs = await getWorkspaceForUser(second.id);

    // Also a member of the (older) first workspace, e.g. after an invite.
    await db
      .insert(workspaceMember)
      .values({ workspaceId: firstWs!.id, userId: second.id, role: "member" });
    expect((await getWorkspaceForUser(second.id))!.id).toBe(ownWs!.id);
  });

  it("signs in with the right password only", async () => {
    await signUp("owner@example.com");

    const ok = await auth.api.signInEmail({
      body: { email: "owner@example.com", password },
    });
    expect(ok.user.email).toBe("owner@example.com");

    await expect(
      auth.api.signInEmail({
        body: { email: "owner@example.com", password: "wrong password!!" },
      }),
    ).rejects.toThrow();
  });
});

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

  it("lets new accounts join the existing workspace when ALLOW_REGISTRATION=true", async () => {
    const { user: owner } = await signUp("owner@example.com");
    process.env.ALLOW_REGISTRATION = "true";
    const { user: teammate } = await signUp("teammate@example.com");

    const ownerWs = await getWorkspaceForUser(owner.id);
    const teammateWs = await getWorkspaceForUser(teammate.id);
    expect(teammateWs).toMatchObject({ id: ownerWs!.id, role: "member" });

    const members = await db
      .select()
      .from(workspaceMember)
      .where(eq(workspaceMember.workspaceId, ownerWs!.id));
    expect(members).toHaveLength(2);
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

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { addUserToWorkspace, isRegistrationOpen } from "@/lib/registration";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(await isRegistrationOpen())) {
            throw new APIError("FORBIDDEN", {
              message:
                "Registration is closed on this Greer instance. Ask its owner to enable ALLOW_REGISTRATION.",
            });
          }
          return { data: user };
        },
        after: async (user) => {
          await addUserToWorkspace(user.id);
        },
      },
    },
  },
  // Must stay last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { hasAnyUser } from "@/lib/registration";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · Greer" };

export default async function SignInPage() {
  if (await getSession()) redirect("/today");
  // Fresh install: nobody to sign in as yet; setup is on the welcome page.
  if (!(await hasAnyUser())) redirect("/");
  return <AuthForm mode="sign-in" />;
}

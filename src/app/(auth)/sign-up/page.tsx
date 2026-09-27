import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasAnyUser, isRegistrationOpen } from "@/lib/registration";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Create your account · Greer" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/inbox");

  if (!(await isRegistrationOpen())) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Registration is closed</h1>
          </CardTitle>
          <CardDescription>
            This Greer instance already has an owner. Ask them to enable{" "}
            <code>ALLOW_REGISTRATION</code>, or{" "}
            <Link href="/sign-in" className="underline underline-offset-4">
              sign in
            </Link>{" "}
            if you have an account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const firstRun = !(await hasAnyUser());
  return <AuthForm mode="sign-up" firstRun={firstRun} />;
}

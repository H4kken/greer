"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 10;

type Props = { mode: "sign-in" } | { mode: "sign-up"; firstRun: boolean };

export function AuthForm(props: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const signUp = props.mode === "sign-up";

  const copy = signUp
    ? props.firstRun
      ? {
          title: "Set up Greer",
          description:
            "Create the owner account for this instance. After this, registration closes.",
          submit: "Create account",
        }
      : {
          title: "Create your account",
          description: "You'll join this instance's workspace.",
          submit: "Create account",
        }
    : {
        title: "Sign in",
        description: "Welcome back.",
        submit: "Sign in",
      };

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "");
    setError(null);

    startTransition(async () => {
      const { error } = signUp
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
      if (error) {
        setError(
          error.status === 401
            ? "Wrong email or password."
            : (error.message ?? "Something went wrong. Please try again."),
        );
        return;
      }
      router.push("/inbox");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{copy.title}</h1>
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {signUp && (
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  disabled={pending}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={signUp ? "new-password" : "current-password"}
                minLength={signUp ? MIN_PASSWORD_LENGTH : undefined}
                required
                disabled={pending}
                aria-describedby={signUp ? "password-hint" : undefined}
              />
              {signUp && (
                <FieldDescription id="password-hint">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </FieldDescription>
              )}
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? "Please wait…" : copy.submit}
              </Button>
              {!signUp && (
                <FieldDescription className="text-center">
                  No account yet? <Link href="/sign-up">Create one</Link>
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

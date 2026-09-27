import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { hasAnyUser } from "@/lib/registration";
import { getSession } from "@/lib/session";

export default async function Home() {
  if (await getSession()) redirect("/inbox");
  const firstRun = !(await hasAnyUser());

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <p className="text-sm font-medium text-muted-foreground">
        Early development
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        Find the conversations where you can genuinely help.
      </h1>
      <p className="text-lg text-pretty text-muted-foreground">
        Greer watches the communities where your future users talk about their
        problems, tells you why each thread matters, and gives you ideas, not
        AI-written replies. You write the reply yourself.
      </p>
      <div className="flex gap-2">
        {/* Links styled as buttons: they navigate, so they must stay links for screen readers. */}
        <Link
          href={firstRun ? "/sign-up" : "/sign-in"}
          className={buttonVariants()}
        >
          {firstRun ? "Set up Greer" : "Sign in"}
        </Link>
        <a
          href="https://github.com/H4kken/greer"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          GitHub
        </a>
      </div>
    </main>
  );
}

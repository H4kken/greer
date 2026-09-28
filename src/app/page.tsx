import { EyeIcon, PenLineIcon, ServerIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-toggle";
import { InboxPreview } from "@/components/welcome/inbox-preview";
import { hasAnyUser } from "@/lib/registration";
import { getSession } from "@/lib/session";

const STEPS = [
  {
    title: "Describe what you're building",
    text: "The problems your product solves, in plain words.",
  },
  {
    title: "Pick where to listen",
    text: "Hacker News keywords. Greer reads the last week, then checks every 15 minutes.",
  },
  {
    title: "Triage ten minutes a day",
    text: "Threads ranked by how well you can help, each with the reason why.",
  },
];

const PROMISES = [
  {
    Icon: EyeIcon,
    text: "Greer only reads. It never posts, votes or sends messages.",
  },
  {
    Icon: PenLineIcon,
    text: "You write every reply. Greer gives ideas, never AI-written text.",
  },
  {
    Icon: ServerIcon,
    text: "Self-hosted: your data stays in this instance's database.",
  },
];

// The front door. A fresh install shows the welcome with the owner-account
// form; once someone owns the instance, the same page signs people in.
export default async function Home() {
  if (await getSession()) redirect("/today");
  const firstRun = !(await hasAnyUser());

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Logo />
        <ThemeMenu />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-x-16 gap-y-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:py-16">
        <section className="flex flex-col gap-4 lg:col-start-1">
          <h1 className="text-4xl leading-tight font-medium tracking-tight text-balance sm:text-5xl">
            Find the conversations where you can genuinely help.
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Greer watches the communities where your future users talk about
            their problems, and tells you which threads are worth your time. You
            write the replies yourself.
          </p>
        </section>

        {/* After the intro in reading order; beside it on wide screens. */}
        <div className="lg:sticky lg:top-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {firstRun ? (
            <AuthForm mode="sign-up" firstRun titleAs="h2" />
          ) : (
            <AuthForm mode="sign-in" titleAs="h2" />
          )}
        </div>

        <div className="flex flex-col gap-10 lg:col-start-1">
          <InboxPreview />

          <section
            aria-labelledby="how-heading"
            className="flex flex-col gap-4"
          >
            <h2 id="how-heading" className="text-2xl font-medium">
              How it works
            </h2>
            <ol className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-1.5">
                  <span
                    aria-hidden
                    className="flex size-7 items-center justify-center rounded-full bg-primary-soft font-mono text-sm text-primary-soft-foreground"
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium">{step.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {step.text}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <ul
            aria-label="What Greer promises"
            className="flex flex-col gap-2.5 border-t pt-6 text-sm"
          >
            {PROMISES.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5">
                <Icon
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground">
        Open source under AGPL-3.0 ·{" "}
        <a href="https://github.com/H4kken/greer" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}

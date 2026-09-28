import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { seedAccount, seedAnswer, seedThreads } from "./seed";

// One story, in order: a fresh install gets its owner, who goes through
// onboarding; then registration is closed. The LLM is mocked (see
// playwright.config.ts) and no worker runs, so nothing hits the network.
// No retries: a retry can't replay earlier steps (the owner already exists).
test.describe.configure({ mode: "serial", retries: 0 });

// The owner's session, saved after sign-up and reused by the onboarding and
// settings tests: signing in before each one would trip the sign-in rate limit.
const OWNER_STATE = "test-results/owner-state.json";

const owner = {
  name: "Ada",
  email: "ada@example.com",
  password: "correct horse battery",
};

async function expectNoSeriousA11yViolations(page: Page) {
  // Let entrance animations finish, or axe measures half-faded colors.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
}

test("first visitor sets up the instance and lands in onboarding", async ({
  page,
}) => {
  // A fresh install: the welcome page holds the owner-account form.
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Find the conversations where you can genuinely help.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Set up Greer" }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByLabel("Name").fill(owner.name);
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding\/product$/);
  await expect(
    page.getByRole("heading", { name: "What are you building?" }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.context().storageState({ path: OWNER_STATE });
});

test.describe("as the owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("owner describes the product, picks keywords and starts the first scan", async ({
    page,
  }) => {
    // Not onboarded yet: the inbox sends them back to onboarding.
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/onboarding\/product$/);

    // The mock LLM counts as configured, so no key form here.
    await expect(
      page.getByRole("heading", { name: "Connect an AI model" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Give your product a name.")).toBeVisible();

    await page.getByLabel("Product name").fill("Greer");
    // Fixing a field clears its error right away.
    await expect(page.getByText("Give your product a name.")).toHaveCount(0);
    await page
      .getByLabel("What it does")
      .fill(
        "Finds conversations where small SaaS builders can genuinely help.",
      );
    await page
      .getByRole("textbox", { name: "Problem 1" })
      .fill("Getting the first paying customers");
    await page
      .getByRole("textbox", { name: "Problem 2" })
      .fill("Doing outreach without being spammy");
    await expect(
      page
        .getByRole("complementary")
        .getByText("Doing outreach without being spammy"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2 is optional. Connecting reads HN's public API, which tests never
    // call, so only the validation and the skip path are covered here.
    await expect(page).toHaveURL(/\/onboarding\/accounts$/);
    await expect(
      page.getByRole("heading", { name: "Connect your accounts" }),
    ).toBeVisible();
    await page.getByLabel("Your Hacker News username").fill("not a name!");
    const connect = page.getByRole("button", { name: "Connect" });
    await connect.click();
    await expect(
      page.getByText("That doesn't look like an HN username."),
    ).toBeVisible();
    // Wait for its fade back from the pending style.
    await expect(connect).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);
    await page.getByRole("link", { name: "Skip for now" }).click();

    await expect(page).toHaveURL(/\/onboarding\/keywords$/);
    await expect(
      page.getByRole("heading", { name: "Where should Greer listen?" }),
    ).toBeVisible();
    // Suggestions from the mock model: the longest word of each problem.
    await expect(page.getByText("customers", { exact: true })).toBeVisible();
    await expect(page.getByText("outreach", { exact: true })).toBeVisible();
    const start = page.getByRole("button", { name: "Start the first scan" });
    await expect(start).toBeEnabled();
    // Wait for its fade from the disabled style, or axe measures it half-faded.
    await expect(start).toHaveCSS("opacity", "1");
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: "Remove keyword outreach" }).click();
    await expect(page.getByText("outreach", { exact: true })).toHaveCount(0);
    await page.getByLabel("Add a keyword").fill("First Users");
    await page.getByLabel("Where to search").selectOption("story_comment");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("first users", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Start the first scan" }).click();
    await expect(page).toHaveURL(/\/onboarding\/scan$/);
    await expect(
      page.getByRole("heading", {
        name: "Reading the last 7 days of Hacker News",
      }),
    ).toBeVisible();
    // No worker runs in e2e: the page says so instead of spinning forever.
    await expect(
      page.getByText("The background worker isn't running"),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("link", { name: /Open my inbox/ }).click();
    await expect(page).toHaveURL(/\/inbox(\?|$)/);
    await expect(
      page.getByRole("heading", { name: /Needs help/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No threads yet" }),
    ).toBeVisible();
    await expect(page.getByText("My workspace")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("accounts list every platform, with Hacker News ready to connect", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await page.getByRole("link", { name: "Accounts" }).click();
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await expect(page.getByLabel("Your Hacker News username")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Create one on Hacker News/ }),
    ).toHaveAttribute("href", "https://news.ycombinator.com/login");
    const reddit = page.getByRole("region", { name: "Reddit" });
    await expect(reddit.getByText("Coming later")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("settings show the onboarding choices and keywords can be undone", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByLabel("Product name")).toHaveValue("Greer");
    await expect(page.getByText("Mock (test mode)")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    const keywords = page.getByRole("region", { name: "Keywords" });
    await expect(keywords.getByText("first users")).toBeVisible();
    await expect(keywords.getByText("Show HN launches")).toBeVisible();

    await keywords
      .getByRole("button", { name: 'Remove "first users"' })
      .click();
    await expect(keywords.getByText("first users")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(keywords.getByText("first users")).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("region", { name: "Keywords" }).getByText("first users"),
    ).toBeVisible();

    // Theme: pick Dark in Settings, it survives a reload; the header menu
    // switches back to Light.
    const html = page.locator("html");
    await page
      .getByRole("group", { name: "Theme" })
      .getByText("Dark", { exact: true })
      .click();
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await expectNoSeriousA11yViolations(page);
    await page.getByRole("button", { name: "Theme: Dark" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/dark/);
    await expect(
      page.getByRole("button", { name: "Theme: Light" }),
    ).toBeVisible();
  });

  test("owner triages threads from the keyboard, with undo", async ({
    page,
  }) => {
    await seedThreads([
      { title: "Zero paying customers after a month", score: 92 },
      { title: "How to do outreach without spam", score: 81 },
      { title: "Where do I find beta testers", score: 70 },
      { title: "A barely related thread", score: 30 },
      { title: "Show HN: My first SaaS", score: 75, category: "feedback" },
    ]);

    // The scan page counts people (all seeded threads share one author) and
    // previews the top three worth a reply; a thread opens in the inbox.
    await page.goto("/onboarding/scan");
    await expect(
      page.getByText("Found 1 person you could help so far."),
    ).toBeVisible();
    const best = page.getByRole("region", { name: "Best threads so far" });
    await expect(best.getByRole("link")).toHaveCount(3);
    await expect(
      page.getByRole("link", { name: "Meet them in your inbox" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await best.getByRole("link", { name: /Zero paying customers/ }).click();
    await expect(page).toHaveURL(/\/inbox\?item=/);

    await page.goto("/inbox");

    const threads = page.getByRole("list", { name: "Threads" });
    const panelTitle = (name: string) =>
      page.getByRole("heading", { level: 2, name });
    await expect(threads.getByRole("button")).toHaveCount(3);
    await expect(
      panelTitle("Zero paying customers after a month"),
    ).toBeVisible();
    await expect(
      page.getByText("Strongly matches: Getting the first paying customers"),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // j moves down and focuses the row; the panel follows.
    await page.keyboard.press("j");
    await expect(
      threads.getByRole("button", { name: /outreach without spam/ }),
    ).toBeFocused();
    await expect(panelTitle("How to do outreach without spam")).toBeVisible();

    // d dismisses and moves on; Undo brings it back.
    await page.keyboard.press("d");
    await expect(threads.getByRole("button")).toHaveCount(2);
    await expect(panelTitle("Where do I find beta testers")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(threads.getByRole("button")).toHaveCount(3);

    // s snoozes; the thread shows up in the Snoozed view, u moves it back.
    await threads.getByRole("button", { name: /beta testers/ }).click();
    await page.keyboard.press("s");
    await expect(threads.getByRole("button")).toHaveCount(2);
    await page.getByRole("link", { name: /^Snoozed/ }).click();
    await expect(threads.getByRole("button")).toHaveCount(1);
    await page.keyboard.press("u");
    await expect(
      page.getByRole("heading", { name: "Nothing snoozed" }),
    ).toBeVisible();

    // Lower matches are one click away; launches have their own tab.
    await page.getByRole("link", { name: /^Needs help/ }).click();
    await expect(threads.getByRole("button")).toHaveCount(3);
    await page.getByRole("link", { name: "Show 1 lower matches" }).click();
    await expect(threads.getByRole("button")).toHaveCount(4);
    await page.getByRole("link", { name: /^Feedback · Show HN/ }).click();
    await expect(panelTitle("Show HN: My first SaaS")).toBeVisible();

    // ? lists the shortcuts.
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    // Let the open animation finish, or axe measures half-faded text.
    await dialog.evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
    );
    await expectNoSeriousA11yViolations(page);
  });

  test("the inbox works on a phone and in dark mode", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/inbox");
    await expect(page.locator("html")).toHaveClass(/dark/);

    const threads = page.getByRole("list", { name: "Threads" });
    await expect(threads).toBeVisible();
    const noSideScroll = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    expect(await noSideScroll()).toBe(true);
    await expectNoSeriousA11yViolations(page);

    // List and thread panel stack: opening a thread replaces the list.
    await threads
      .getByRole("button", { name: /outreach without spam/ })
      .click();
    await expect(threads).toBeHidden();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "How to do outreach without spam",
      }),
    ).toBeVisible();
    expect(await noSideScroll()).toBe(true);
    await expectNoSeriousA11yViolations(page);
    await page.getByRole("button", { name: "Back to the list" }).click();
    await expect(threads).toBeVisible();
  });

  test("the inbox shows who answered the owner's replies", async ({ page }) => {
    await seedAnswer({
      author: "devon_b",
      text: "How long did that take before someone asked about your product?",
      tone: "question",
    });
    await page.goto("/inbox");
    const answers = page.getByRole("region", { name: "They answered you" });
    await expect(answers.getByText("devon_b")).toBeVisible();
    await expect(answers.getByText(/asked you something/)).toBeVisible();
    await expect(
      answers.getByRole("link", { name: /Answer on HN/ }),
    ).toHaveAttribute("href", "https://news.ycombinator.com/item?id=80002");
    await expectNoSeriousA11yViolations(page);
  });

  test("people shows who the owner talked with, and takes a 'tried it' mark", async ({
    page,
  }) => {
    // Without a linked account, the page says how to get started.
    await page.goto("/people");
    await expect(
      page.getByRole("heading", { name: "Connect your account first" }),
    ).toBeVisible();

    // devon_b (question) is already there from the inbox test.
    await seedAccount("ada_hn");
    await seedAnswer(
      { author: "sarahk", text: "Thanks, trying it tonight!", tone: "thanks" },
      { n: 1, parentAuthor: "sarahk" },
    );
    await page.goto("/people");

    // The open question comes first.
    const panel = page.getByRole("region", { name: "devon_b" });
    await expect(panel.getByText("Asked you something")).toBeVisible();
    await expect(
      panel.getByRole("link", { name: /Answer on HN/ }),
    ).toHaveAttribute("href", "https://news.ycombinator.com/item?id=80002");
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: /^sarahk,/ }).click();
    const sarah = page.getByRole("region", { name: "sarahk" });
    await expect(sarah.getByText("Thanks, trying it tonight!")).toBeVisible();
    await sarah.getByRole("button", { name: "They tried Greer" }).click();
    await expect(
      sarah.getByText("Tried Greer · you marked this"),
    ).toBeVisible();

    // The mark is saved (Undo is enabled once the server confirmed), and can
    // be taken back.
    await expect(sarah.getByRole("button", { name: "Undo" })).toBeEnabled();
    await page.reload();
    await page.getByRole("button", { name: /^sarahk,.*tried Greer/ }).click();
    await page
      .getByRole("region", { name: "sarahk" })
      .getByRole("button", { name: "Undo" })
      .click();
    await expect(
      page
        .getByRole("region", { name: "sarahk" })
        .getByRole("button", { name: "They tried Greer" }),
    ).toBeVisible();
  });
});

test("owner signs out and back in; a wrong password is rejected", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Filter by text: Next.js also renders an (empty) role="alert" route announcer.
  await expect(
    page.getByRole("alert").filter({ hasText: "Wrong email or password." }),
  ).toBeVisible();

  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/inbox(\?|$)/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("once set up, the welcome page signs people in", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 2, name: "Sign in" }),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);
});

test("registration is closed once the owner exists", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(
    page.getByRole("heading", { name: "Registration is closed" }),
  ).toBeVisible();
});

test("the inbox requires a session", async ({ page }) => {
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/sign-in$/);
});

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { seedAccount, seedAnswer, seedMissingReply, seedThreads } from "./seed";

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
    // Not onboarded yet: Today sends them back to onboarding.
    await page.goto("/today");
    await expect(page).toHaveURL(/\/onboarding\/product$/);

    // The mock model does both AI jobs, so no AI setup here.
    await expect(page.getByRole("heading", { name: "Connect AI" })).toHaveCount(
      0,
    );

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
    // Each group has its own add field.
    const comments = page.getByRole("region", {
      name: "All stories and comments",
    });
    await comments
      .getByLabel("Add to All stories and comments")
      .fill("First Users");
    await comments.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      comments.getByText("first users", { exact: true }),
    ).toBeVisible();
    // Suggested on: the mock sees builders in the product profile.
    await expect(
      page.getByRole("switch", { name: "Launches (Show HN)" }),
    ).toBeChecked();

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

    await page.getByRole("link", { name: "Go to Today" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /, Ada$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nobody here yet" }),
    ).toBeVisible();
    await expect(page.getByText("My workspace")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("accounts list every platform, with Hacker News ready to connect", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: "Accounts" }).click();
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await expect(page.getByLabel("Your Hacker News username")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Create one on Hacker News/ }),
    ).toHaveAttribute("href", "https://news.ycombinator.com/login");
    await expectNoSeriousA11yViolations(page);
  });

  test("settings show the onboarding choices and keywords can be undone", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByLabel("Product name")).toHaveValue("Greer");
    await expect(page.getByText("Mock (test mode)").first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // AI is explained as two jobs. Picking TypeSafe Jev for sorting (mock
    // mode skips the test call) shows the fallback; clearing it goes back.
    const sorting = page.getByRole("region", { name: "Sorting threads" });
    const writing = page.getByRole("region", { name: "Writing help" });
    // A job that's set folds its form behind "Change".
    const openForm = async (card: typeof sorting) => {
      if ((await card.locator("details").getAttribute("open")) === null) {
        await card.getByText("Change", { exact: true }).click();
      }
    };
    await expect(
      writing.getByText("Now: Mock (test mode) mock-quality"),
    ).toBeVisible();
    await openForm(sorting);
    await expect(sorting.getByLabel("Provider")).toHaveValue("typesafe");
    await sorting.getByLabel("API key").fill("ts-e2e-key");
    await sorting.getByRole("button", { name: "Test and save" }).click();
    await expect(
      page.getByText("TypeSafe Jev now does the sorting."),
    ).toBeVisible();
    await expect(sorting.getByText("Now: TypeSafe Jev.")).toBeVisible();
    await expect(
      sorting.getByText(/If Jev is unavailable, Mock \(test mode\)/),
    ).toBeVisible();
    await openForm(sorting);
    await expect(sorting.getByLabel("API key")).toHaveAttribute(
      "placeholder",
      /^Saved: /,
    );
    await expectNoSeriousA11yViolations(page);
    await sorting.getByRole("button", { name: "Clear choice" }).click();
    await expect(sorting.getByText(/Now: Mock \(test mode\)/)).toBeVisible();
    await openForm(sorting);
    await expect(
      sorting.getByRole("button", { name: "Clear choice" }),
    ).toHaveCount(0);

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

  test("owner meets today's people from the keyboard, with undo", async ({
    page,
  }) => {
    await seedThreads([
      { title: "Zero paying customers after a month", score: 92, comments: 0 },
      { title: "How to do outreach without spam", score: 81 },
      { title: "Where do I find beta testers", score: 70 },
      { title: "Pricing a tool for developers", score: 65 },
      // Same person as the first thread: one card for both.
      { title: "Churn right after the trial", score: 60, author: "maker0" },
      { title: "A barely related thread", score: 30 },
      { title: "Show HN: My first SaaS", score: 75, category: "feedback" },
    ]);

    // The scan page counts people (maker0 has two threads) and previews the
    // top three worth a reply; a thread opens on Today.
    await page.goto("/onboarding/scan");
    await expect(
      page.getByText("Found 5 people you could help so far."),
    ).toBeVisible();
    const best = page.getByRole("region", { name: "Best threads so far" });
    await expect(best.getByRole("link")).toHaveCount(3);
    await expect(
      page.getByRole("link", { name: "Meet them on Today" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await best.getByRole("link", { name: /Zero paying customers/ }).click();
    await expect(page).toHaveURL(/\/today\?p=item/);
    const panelTitle = (name: string) =>
      page.getByRole("heading", { level: 2, name });
    await expect(
      panelTitle("Zero paying customers after a month"),
    ).toBeVisible();

    // Old inbox links land on Today.
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/today$/);
    // No worker runs in e2e: Today says checks are paused, not a countdown.
    await expect(
      page.getByText("Greer's background worker isn't running"),
    ).toBeVisible();

    // No account yet, so the pace is a new account's: the three best new
    // people, a launch among them, the weak match left out. Nobody picked:
    // your people fill the space.
    const feed = page.getByRole("list", { name: "Today's people" });
    await expect(feed.getByRole("button")).toHaveCount(3);
    await expect(page.getByText("3 people could use your help.")).toBeVisible();
    await expect(
      feed.getByRole("button", { name: /My first SaaS/ }),
    ).toContainText("Show HN");
    await expect(
      feed.getByRole("button", { name: /My first SaaS/ }),
    ).toContainText("Potential user");
    // One card per person: maker0's second thread rides along.
    await expect(
      feed.getByRole("button", { name: /Zero paying customers/ }),
    ).toContainText("+1 more thread");
    // Someone in the builder's audience, facing their problem: a carrot.
    await expect(
      feed.getByRole("button", { name: /Zero paying customers/ }),
    ).toContainText("Potential user");
    // How the conversation is going, once Greer has checked.
    await expect(
      feed.getByRole("button", { name: /Zero paying customers/ }),
    ).toContainText("No replies yet");
    await expect(
      page.getByRole("heading", { level: 2, name: "Your people" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // j picks the first person and moves down; the panel follows.
    await page.keyboard.press("j");
    await expect(
      panelTitle("Zero paying customers after a month"),
    ).toBeVisible();
    await expect(
      page.getByText("Strongly matches: Getting the first paying customers"),
    ).toBeVisible();
    await page.keyboard.press("j");
    await expect(
      feed.getByRole("button", { name: /outreach without spam/ }),
    ).toBeFocused();
    await expect(panelTitle("How to do outreach without spam")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // d says "not for me" and moves on; Undo brings it back.
    await page.keyboard.press("d");
    await expect(feed.getByRole("button")).toHaveCount(2);
    await expect(panelTitle("Show HN: My first SaaS")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open on HN to give feedback/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(feed.getByRole("button")).toHaveCount(3);

    // "I replied" takes the card off right away, with undo. (Undo above
    // picked the outreach card again.)
    await expect(panelTitle("How to do outreach without spam")).toBeVisible();
    await page.getByRole("button", { name: /^I replied/ }).click();
    await expect(feed.getByRole("button")).toHaveCount(2);
    await expect(page.getByText("counts in today's progress")).toBeVisible();
    // They join your people right away, waiting for an answer.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("img", { name: /You replied to maker1, no answer yet/ }),
    ).toBeVisible();
    await page.keyboard.press("z");
    await expect(feed.getByRole("button")).toHaveCount(3);

    // Escape goes back to your people.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { level: 2, name: "Your people" }),
    ).toBeVisible();

    // Past the pace is one click away, with a gentle note.
    await page.getByRole("button", { name: "Show 2 more new people" }).click();
    await expect(
      page.getByText("You're past today's pace of 3."),
    ).toBeVisible();
    const more = page.getByRole("list", { name: "More people" });
    await expect(more.getByRole("button")).toHaveCount(2);

    // Hidden threads bring one back for good.
    await more.getByRole("button", { name: /beta testers/ }).click();
    await page.getByRole("button", { name: /^Not for me/ }).click();
    await expect(more.getByRole("button")).toHaveCount(1);
    await page.getByRole("link", { name: "Hidden threads" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Hidden threads" }),
    ).toBeVisible();
    const hidden = page.getByRole("list", { name: "Hidden threads" });
    await expect(
      hidden.getByText("Where do I find beta testers"),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await hidden.getByRole("button", { name: "Bring back" }).click();
    await expect(
      page.getByRole("heading", { name: "Nothing hidden" }),
    ).toBeVisible();
    // The row hides right away; the toast means the server has it.
    await expect(page.getByText(/^Back on Today:/)).toBeVisible();
    await page.goto("/today");
    await page.getByRole("button", { name: "Show 2 more new people" }).click();
    await expect(
      more.getByRole("button", { name: /beta testers/ }),
    ).toBeVisible();
  });

  test("today works on a phone and in dark mode", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/today");
    await expect(page.locator("html")).toHaveClass(/dark/);

    const feed = page.getByRole("list", { name: "Today's people" });
    await expect(feed).toBeVisible();
    const noSideScroll = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    expect(await noSideScroll()).toBe(true);
    await expectNoSeriousA11yViolations(page);

    // Feed and panel stack: picking someone replaces the feed.
    await feed.getByRole("button", { name: /outreach without spam/ }).click();
    await expect(feed).toBeHidden();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "How to do outreach without spam",
      }),
    ).toBeVisible();
    expect(await noSideScroll()).toBe(true);
    await expectNoSeriousA11yViolations(page);
    await page.getByRole("button", { name: "Back to today" }).click();
    await expect(feed).toBeVisible();
  });

  test("today shows people the owner knows when they have news", async ({
    page,
  }) => {
    // Without a linked account, Today and People say how to get started.
    await page.goto("/today");
    await expect(
      page.getByRole("link", { name: "Connect your Hacker News account" }),
    ).toHaveCount(2);
    await page.goto("/people");
    await expect(
      page.getByRole("heading", { name: "Connect your account first" }),
    ).toBeVisible();

    await seedAccount("ada_hn");
    await seedAnswer({
      author: "devon_b",
      text: "How long did that take before someone asked about your product?",
      tone: "question",
    });
    await page.goto("/today");

    // An open question comes first, tagged as someone you know.
    const feed = page.getByRole("list", { name: "Today's people" });
    const first = feed.getByRole("button").first();
    await expect(first).toContainText("Someone you know");
    await expect(first).toContainText("Asked you a follow-up");
    await expect(first).toContainText("devon_b");
    // The linked account is established, so its pace allows all 5 new
    // people (4 stuck, 1 launch).
    await expect(
      page.getByText("1 person you know has news, and 5 new people"),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await first.click();
    await expect(
      page.getByRole("link", { name: /Answer on HN/ }),
    ).toHaveAttribute("href", "https://news.ycombinator.com/item?id=80002");
    await expectNoSeriousA11yViolations(page);

    // A thank-you is news until it's been read: open, then gone next visit.
    // A question to the owner stays until answered.
    await seedAnswer(
      { author: "sarahk", text: "Thanks, trying it tonight!", tone: "thanks" },
      { n: 1, parentAuthor: "sarahk", topic: "Pricing" },
    );
    await page.goto("/today");
    const thanks = feed.getByRole("button", { name: /Thanks, trying it/ });
    await thanks.click();
    await page.waitForTimeout(2000); // read for a moment
    await page.goto("/today");
    await expect(feed.getByRole("button", { name: /devon_b/ })).toBeVisible();
    await expect(thanks).toHaveCount(0);

    // A reply marked by hand that Greer never found: Today asks, quietly.
    await seedMissingReply("Is my pricing page confusing?");
    await page.goto("/today");
    const missing = page.getByRole("region", {
      name: "Replies Greer didn't find",
    });
    await expect(missing).toContainText(
      "Greer didn't find your reply to quiet_maker",
    );
    await expectNoSeriousA11yViolations(page);
    await missing.getByRole("button", { name: "Forget it" }).click();
    await expect(
      page.getByText("Forgot your reply to quiet_maker."),
    ).toBeVisible();
    await expect(missing).toBeHidden();
  });

  test("people shows who the owner talked with, and takes a 'tried it' mark", async ({
    page,
  }) => {
    // The account, devon_b (question) and sarahk (thanks) are already there
    // from Today's test.
    await page.goto("/people");

    // Nobody is picked at first; who waits on you is one click away.
    await expect(page.getByRole("region", { name: "devon_b" })).toHaveCount(0);
    await page.getByRole("button", { name: /Waiting on you · 1/ }).click();
    const panel = page.getByRole("region", { name: "devon_b" });
    await expect(panel.getByText("Asked you something")).toBeVisible();
    await expect(
      panel.getByRole("link", { name: /Answer on HN/ }),
    ).toHaveAttribute("href", "https://news.ycombinator.com/item?id=80002");
    await expectNoSeriousA11yViolations(page);

    // The map turns slowly and holds still while a dot has keyboard focus.
    await page.getByRole("button", { name: /^sarahk,/ }).focus();
    await page.keyboard.press("Enter");
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
    await page.getByRole("button", { name: /^sarahk,.*tried Greer/ }).focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("region", { name: "sarahk" })
      .getByRole("button", { name: "Undo" })
      .click();
    await expect(
      page
        .getByRole("region", { name: "sarahk" })
        .getByRole("button", { name: "They tried Greer" }),
    ).toBeVisible();

    // Topics: picking one shows how it's going and the people in it.
    const topics = page.getByRole("list", {
      name: "What you help people with",
    });
    const pricing = topics.getByRole("button", { name: /Pricing/ });
    await expect(pricing).toContainText("Growing");
    await pricing.click();
    await expect(pricing).toHaveAttribute("aria-pressed", "true");
    // (The phone layout's copy is in the page too, hidden.)
    const line = page
      .getByText(/You talked with 1 person about it/)
      .filter({ visible: true });
    await expect(line).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "sarahk" })
        .getByText("You helped with pricing"),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await topics.getByRole("button", { name: "Everyone" }).click();
    await expect(line).toBeHidden();

    // The wheel zooms in around the pointer; one click resets it.
    const map = page.getByRole("region", {
      name: "Everyone you've talked with",
    });
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    const resetZoom = page.getByRole("button", { name: "Reset zoom" });
    await resetZoom.click();
    await expect(resetZoom).toBeHidden();
    // Past the resting view, it zooms out too.
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await resetZoom.click();
    await expect(resetZoom).toBeHidden();

    // Escape puts the picked person away.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "sarahk" })).toHaveCount(0);

    // Phones get a list; picking someone opens a sheet.
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("list", { name: "Everyone you've talked with" })
      .getByRole("button", { name: /devon_b/ })
      .click();
    const sheet = page.getByRole("dialog", { name: "devon_b" });
    await expect(sheet.getByText("Asked you something")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
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
  await expect(page).toHaveURL(/\/today$/);

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

test("today requires a session", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in$/);
});

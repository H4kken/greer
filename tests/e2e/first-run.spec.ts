import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

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
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
}

test("first visitor sets up the instance and lands in onboarding", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Set up Greer" }).click();

  await expect(
    page.getByRole("heading", { name: "Set up Greer" }),
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

    await expect(page).toHaveURL(/\/onboarding\/account$/);
    await expect(
      page.getByRole("heading", { name: "Where should Greer listen?" }),
    ).toBeVisible();
    // Suggestions from the mock model: the longest word of each problem.
    await expect(page.getByText("customers", { exact: true })).toBeVisible();
    await expect(page.getByText("outreach", { exact: true })).toBeVisible();
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
      page.getByRole("heading", { name: "Reading the last 7 days of HN" }),
    ).toBeVisible();
    // No worker runs in e2e: the page says so instead of spinning forever.
    await expect(
      page.getByText("The background worker isn't running"),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("link", { name: /Open my inbox/ }).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.getByText("My workspace")).toBeVisible();
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
  await expect(page).toHaveURL(/\/inbox$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
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

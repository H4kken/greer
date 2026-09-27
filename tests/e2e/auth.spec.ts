import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// One story, in order: a fresh install gets its owner, then registration closes.
// No retries: a retry can't replay earlier steps (the owner already exists).
test.describe.configure({ mode: "serial", retries: 0 });

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

test("first visitor sets up the instance and lands in the inbox", async ({
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

  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByText("My workspace")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
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

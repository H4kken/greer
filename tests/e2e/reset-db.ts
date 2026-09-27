// Runs before the e2e web server starts (see playwright.config.ts):
// every run starts from a fresh install, like a new self-hoster.
import { E2E_DATABASE_URL, resetDatabase } from "../helpers/db.ts";

await resetDatabase(E2E_DATABASE_URL);

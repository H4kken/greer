// Imported first by the worker entry point, before any library reads the
// environment.
import { dropEmptyEnv } from "@/lib/env";

// Loads .env when present (Next.js does this for the web app; the worker is a
// plain Node process).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the environment.
}
dropEmptyEnv();

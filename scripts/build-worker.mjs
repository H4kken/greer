// Bundles the worker and the migration script into plain JavaScript for the
// Docker image (Next's standalone output only covers the web server).
import { build } from "esbuild";

await build({
  entryPoints: {
    worker: "src/worker/index.ts",
    migrate: "src/db/migrate.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // pg optionally loads native bindings we don't use.
  external: ["pg-native"],
  // Bundled CommonJS dependencies (pg) still call require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});

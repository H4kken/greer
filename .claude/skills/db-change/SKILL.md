---
name: db-change
description: Change the Postgres schema with Drizzle (new table, column, index or enum value). Use whenever src/db/schema.ts needs to change.
---

# Database schema changes

1. Edit `src/db/schema.ts` only. Never hand-edit or delete a migration that has already been committed; self-hosters may have applied it.
2. New workspace-owned tables get `workspace_id` (FK, not null, indexed) plus `created_at` / `updated_at`.
3. Prefer additive changes. For renames or type changes, add the new column, backfill, and drop the old one in a later release; users upgrade across several versions at once.
4. Run `pnpm db:generate`, then read the generated SQL in `src/db/migrations/` and check it does what you expect (no accidental drops).
5. Run `pnpm db:migrate` against the local database and `pnpm test`.
6. Migrations run automatically on container start, so they must be safe on a database with real data: no long table rewrites without a note in the CHANGELOG.

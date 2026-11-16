# Supabase project workflow

The Supabase migration directory contains the complete 15-migration history recorded by the connected project. The 11 historical SQL files that were absent from GitHub were restored from `supabase_migrations.schema_migrations.statements` and checked against the ledger.

## Safety rules

- Treat the connected Supabase project as the source of truth until a clean local migration test has passed.
- Do not run `supabase db reset` against the connected remote project. It is destructive.
- Before any remote `supabase db push`, inspect the migration diff, confirm the target project, and take/verify a backup.
- Test the full migration chain against a disposable local database or approved Supabase branch before production release.
- Keep `private` out of the exposed PostgREST schema list. Only public wrapper RPCs should be exposed.
- Never put a Supabase service-role key in the browser or in committed environment files.

## Local setup

1. Install a supported Node.js runtime (see `aegis-app/package.json` engines) and the Supabase CLI.
2. Link the CLI to the project referenced by `project_id` in `config.toml`.
3. Start a disposable local Supabase stack and run the full migration chain there.
4. Run the AEGIS application tests and verify role-specific RLS behavior before proposing any remote migration.

The project reference in `config.toml` is an identifier, not a credential.

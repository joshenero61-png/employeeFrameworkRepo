# Supabase migrations

This directory currently contains the new document-path hardening migration:

- `20261116055624_restrict_document_storage_object_paths.sql`

**Important migration-history note:** the connected Supabase project already had 11 earlier migrations applied before this file was added. Their version/name records exist in the hosted migration history, but their SQL files have not yet been imported into this repository.

This means the directory is not yet a complete, reproducible database history. Do not run `supabase db reset` or `supabase db push` from this repository until the earlier migration files have been recovered or a verified baseline has been created and reconciled with the hosted migration history.

The next database-maintenance task is to backfill and verify the existing migration history, then use version-controlled migrations for all future schema and policy changes.

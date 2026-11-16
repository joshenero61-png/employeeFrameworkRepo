# AEGIS HRIS / Recruitment CRM — Project Readiness

Last reviewed: 2026-11-16  
Working branch: `aegis-development`

## Current implementation

- Supabase Auth session handling and role-loading foundation.
- Role-aware employee directory.
- Admin/HR Manager employee create and update actions.
- Employee directory search and department/position labels.
- Recruiter and employee reads use `public.get_employee_directory()`, which returns only non-sensitive profile fields.
- Employee status remains database-controlled (new records default to `active`) until the lifecycle decision is approved.
- Employee-document visibility is opt-in through `employee_documents.employee_visible`; the default is `false`.
- Vercel preview builds run unit tests before the production bundle build.
- Vercel Preview environment variables are scoped to `aegis-development`; no Production environment variables were added.

## Latest verified evidence

- Vercel preview build for commit `b7d17d9922ec3df9c129c84016d416571f2e714c`: READY.
- Automated tests in that build: 12 passed across 2 test files.
- TypeScript check and Vite production build: passed.
- Bundle-size warning: resolved by lazy-loading pages and splitting the Supabase client into its own chunk.
- Supabase inventory: 17 public tables, 62 public RLS policies, 63 public triggers.
- Supabase data counts at review: 34 employees, 45 candidates, 0 employee document metadata rows.
- Supabase migration history: 14 applied migrations.
- Security advisor after the employee-directory hardening: only the previously acknowledged leaked-password-protection warning remains.
- Performance advisor reports 20 unused indexes. These are informational on the current test dataset and have not been removed.

The latest repository change after the verified build updates Content Security Policy headers; its preview build is pending verification.

## Database security changes applied

1. Recruiters no longer have direct table-level row access to all employee records through the `employees_select` policy.
2. `get_employee_directory()` returns only employee ID, name, department, position, hire date, and status to non-HR roles.
3. The privileged implementation lives in the non-exposed `private` schema. The public RPC is a SECURITY INVOKER wrapper.
4. Employee document metadata and storage-object reads are restricted to Admin/HR, or the owning employee when `employee_visible = true`.
5. Existing employee and candidate records were preserved. No rows were deleted or rewritten.

## Critical release blockers

### Migration source recovery

The live database records 14 migrations, but only 3 corresponding SQL files are currently tracked in this repository:

- `20261116055624_restrict_document_storage_object_paths.sql`
- `20261116205839_restrict_employee_data_visibility_and_directory_rpc.sql`
- `20261116205959_move_employee_directory_definer_into_private_schema.sql`

The original 11 migration files are missing. Do not run `supabase db reset` or rely on a clean-environment migration until those sources are recovered or a reviewed baseline is reconstructed and tested.

### Reproducible dependency installation

The repository does not yet contain a committed `aegis-app/package-lock.json`. CI currently generates and uploads a lockfile artifact before running `npm ci`. Commit a reviewed lockfile before production release so dependency resolution is deterministic.

### Feature and QA completion

The following application areas are not yet delivered end-to-end:

- Recruitment CRM: clients, candidates, openings, applications, interviews, and conversion UI.
- Leave request submission, reviewer queues, decisions, and audit verification.
- Compensation administration and protected payroll RPC workflows.
- Employee and candidate document management UI, uploads, downloads, retention, and file validation.
- Audit-log review and operational reporting.
- Full end-to-end tests using separate Admin, HR Manager, Recruiter, Employee, and anonymous identities.
- Clean-environment migration test and documented backup/recovery procedure.

## Open business decisions

Do not silently invent these decisions. Obtain owner approval before implementing the related workflow or changing its policy.

| ID | Decision | Current handling |
|---|---|---|
| OD-01 | Duplicate application rule | No new uniqueness rule added. |
| OD-02 | Which HR roles and whether employees can see compensation | Current database policy permits Admin/HR Manager; owner sign-off required before production. |
| OD-03 | Mandatory employee fields at creation vs onboarding | Form uses current database-required fields; the Attributes workbook was not present in the reviewed project files. |
| OD-04 | Employee lifecycle statuses | Status edits are disabled in the form; database default is `active`. |
| OD-05 | Leave statuses and transitions | No new workflow assumptions added. |
| OD-06 | Multiple interviewers/panel interviews | Existing one-interviewer-per-interview model remains pending confirmation. |
| OD-07 | Candidate conversion behavior for contact details, documents, and existing links | Existing RPC requires full authorization, duplicate, rollback, and traceability tests. |
| OD-08 | Candidate retention, anonymization, and merge policy | Pending. |
| OD-09 | Document categories, file limits/types, retention, and access | Employee visibility is opt-in; category and retention policy remain pending. |
| OD-10 | Final API contract | Supabase PostgREST plus custom RPCs is the current implementation direction; formal OpenAPI contract remains outstanding. |
| OD-11 | First-release operational reports | Pending. |
| OD-12 | Backup retention, RTO, and RPO | Pending. |

## Release gate

AEGIS is **not production-ready** until migration source recovery, all core modules, role-specific RLS tests, candidate conversion concurrency/rollback tests, audit verification, manual workflow testing, and backup/recovery documentation are complete or formally waived.

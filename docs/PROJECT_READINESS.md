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
- Employee directory lists use 25-row server-side pagination, bounded search, and a 100-row maximum RPC page size.
- Employee query cache is scoped by user/role and cleared on sign-out.
- Employee-document visibility is opt-in through `employee_documents.employee_visible`; the default is `false`.
- Vercel preview builds run dependency audit, unit tests, and the production bundle build before publishing a preview.
- Vercel Preview environment variables are scoped to `aegis-development`; no Production environment variables were added.

## Latest verified evidence

- Vercel preview build for commit `9607e53ac095a3089367996fa407c2e09ce5f590`: READY.
- Dependency audit in that build: 0 vulnerabilities.
- Automated tests in that build: 12 passed across 2 test files.
- TypeScript check and Vite production build: passed.
- The latest GitHub Actions run after these changes was not independently verifiable through the available GitHub run-list interface; Vercel performed the same dependency audit, unit tests, type-check, and build as a secondary gate.
- Bundle-size warning: resolved by lazy-loading pages and splitting the Supabase client into its own chunk.
- Supabase inventory: 17 public tables, 62 public RLS policies, 63 public triggers.
- Supabase data counts at review: 34 employees, 45 candidates, 0 employee document metadata rows.
- Supabase migration history: 15 applied migrations; all 15 matching SQL files are now tracked and verified against the hosted ledger.
- Security advisor after the employee-directory hardening: only the previously acknowledged leaked-password-protection warning remains.
- Performance advisor reports 20 unused indexes. These are informational on the current test dataset and have not been removed.

The latest application code includes bounded pagination and the employee-directory RPC. Subsequent changes restored migration source files and added Supabase CLI documentation/configuration; the latest Vercel preview for the repository head is queued.

## Database security changes applied

1. Recruiters no longer have direct table-level row access to all employee records through the `employees_select` policy.
2. `get_employee_directory()` returns only employee ID, name, department, position, hire date, and status to non-HR roles.
3. The privileged implementation lives in the non-exposed `private` schema. The public RPC is a SECURITY INVOKER wrapper.
4. Employee document metadata and storage-object reads are restricted to Admin/HR, or the owning employee when `employee_visible = true`.
5. Existing employee and candidate records were preserved. No rows were deleted or rewritten.

## Critical release blockers

### Clean-environment migration verification

All 15 migration files have now been restored from the hosted migration ledger and verified against the recorded SQL statements. The clean-environment migration chain has not yet been executed in a disposable local database or Supabase branch. Do not run a destructive reset against the connected remote project.

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


## Role-matrix discrepancies requiring owner approval

The live recruitment RLS policies do not fully match the Functional Solution Design Document:

- HR Manager currently has insert/update access to clients, candidates, job openings, and applications; the design document describes HR as read-only, while the QA specification labels some of these permissions optional.
- Recruiter currently has insert/update access but not delete access for those same resources, despite the design matrix describing recruiter full CRUD.
- HR Manager currently has broad interview visibility; the design describes assigned-only visibility.
- Interviewer employees currently have an update policy, while the design matrix describes interviewer read access.

Do not expose broader recruitment controls in the UI or change these database policies until the owner confirms which role matrix is authoritative. The compensation policy also currently allows Admin and HR Manager; OD-02 requires explicit confirmation of which HR users are authorized.

## Release gate

AEGIS is **not production-ready** until the clean migration chain is tested, all core modules are delivered, role-specific RLS tests and candidate-conversion concurrency/rollback tests pass, manual workflows are verified, and backup/recovery is documented or formally waived.

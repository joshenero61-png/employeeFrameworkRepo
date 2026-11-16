# AEGIS HRIS — application foundation

This is the React + TypeScript + Vite application workspace for AEGIS HRIS.
The existing root-level employee directory is intentionally preserved while the
new application is developed in this folder.

## Requirements

- Node.js 20.19+ or 22.12+
- npm (included with Node.js)

## First run

```bash
cd aegis-app
npm install
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
Use the project's public/anon key only. Never put a service-role or secret key in
frontend environment variables.

## Validation

```bash
npm run typecheck
npm run build
```

TypeScript checking is run explicitly because Vite transpiles TypeScript but does
not perform full type-checking by itself.

## Architecture direction

- React components for the UI.
- TypeScript for compile-time safety.
- Vite for local development and production asset builds.
- React Router for screen navigation.
- TanStack Query for server-state caching.
- Supabase JS for Auth, Postgres, and Storage access.
- React Hook Form + Zod for form state and validation.

Database types and feature modules will be added only after verifying the live
Supabase schema and the project's approved functional design. Do not add a
service-role key or bypass database RLS.

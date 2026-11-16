-- =====================================================================
-- 001: Replace the legacy employee DB with the AEGIS HRIS + recruitment CRM schema
-- =====================================================================

-- 1) Preserve the old access roles so existing logins keep working (consumed + dropped in 002)
create table public.legacy_role_map as
  select user_id, role::text as role from public.user_roles;
alter table public.legacy_role_map enable row level security;

-- 2) Tear down the legacy objects
drop table if exists public.employee_phones, public.employee_addresses, public.addresses,
  public.countries, public.employees, public.user_roles, public.audit_log cascade;
drop function if exists public.admin_list_users() cascade;
drop function if exists public.delete_employee(uuid) cascade;
drop function if exists public.delete_orphaned_address() cascade;
drop function if exists public.import_employees(jsonb) cascade;
drop function if exists public.save_employee(jsonb) cascade;
drop function if exists public.set_updated_at() cascade;
drop schema if exists private cascade;
drop type if exists public.address_type, public.app_role, public.phone_type;

create schema private;

-- 3) Shared helper: updated_at maintenance
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 4) Tables ------------------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index departments_name_key on public.departments (lower(name));            -- BR-02

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id),                        -- BR-03
  title text not null check (length(btrim(title)) > 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_id_department_key unique (id, department_id)                    -- target for composite FK
);
create unique index positions_dept_title_key on public.positions (department_id, lower(title));
create index positions_department_id_idx on public.positions (department_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  industry text,
  contact_name text,
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_name_key on public.clients (lower(name));

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null check (length(btrim(last_name)) > 0),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  source text,
  status text not null default 'active' check (status in ('active','hired','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index candidates_email_key on public.candidates (lower(email));

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid unique references public.candidates(id) on delete set null,          -- origin candidate, if hired through the CRM
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null check (length(btrim(last_name)) > 0),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  department_id uuid not null,
  position_id uuid not null,
  manager_id uuid references public.employees(id) on delete set null,
  hire_date date not null default current_date,
  termination_date date,
  status text not null default 'active' check (status in ('active','on_leave','terminated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_position_dept_fkey                                               -- BR-03/04: position must belong to the employee's department
    foreign key (position_id, department_id) references public.positions (id, department_id),
  constraint employees_no_self_manager check (manager_id is null or manager_id <> id),  -- BR-05
  constraint employees_termination_after_hire check (termination_date is null or termination_date >= hire_date)
);
create unique index employees_email_key on public.employees (lower(email));              -- BR-01
create index employees_department_id_idx on public.employees (department_id);
create index employees_position_id_idx on public.employees (position_id);
create index employees_manager_id_idx on public.employees (manager_id);

-- Salary lives in its own table so BR-15 can be enforced with RLS (RLS is row-level, not column-level)
create table public.employee_compensation (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  salary numeric(12,2) not null check (salary >= 0),                                    -- BR-06
  currency char(3) not null default 'USD',
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[a-z_]+$'),
  description text,
  created_at timestamptz not null default now()
);
create unique index user_roles_name_key on public.user_roles (name);

create table public.user_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,                 -- same UUID as Supabase Auth
  employee_id uuid unique references public.employees(id) on delete set null,
  username text check (username is null or length(btrim(username)) > 0),
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index user_accounts_username_key on public.user_accounts (lower(username)); -- BR-13

create table public.user_role_assignments (
  user_id uuid not null references public.user_accounts(user_id) on delete cascade,
  role_id uuid not null references public.user_roles(id),                                -- BR-14
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.user_accounts(user_id) on delete set null,
  primary key (user_id, role_id)
);
create index user_role_assignments_role_id_idx on public.user_role_assignments (role_id);
create index user_role_assignments_assigned_by_idx on public.user_role_assignments (assigned_by);

create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),                                 -- BR-07
  position_id uuid not null references public.positions(id),                             -- BR-07
  title text not null check (length(btrim(title)) > 0),
  description text,
  status text not null default 'draft' check (status in ('draft','open','on_hold','filled','closed')),
  openings_count integer not null default 1 check (openings_count > 0),
  min_salary numeric(12,2) check (min_salary is null or min_salary >= 0),
  max_salary numeric(12,2) check (max_salary is null or max_salary >= 0),
  opened_at date,
  closed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_openings_salary_range check (min_salary is null or max_salary is null or min_salary <= max_salary), -- BR-17
  constraint job_openings_closed_after_opened check (closed_at is null or opened_at is null or closed_at >= opened_at)
);
create index job_openings_client_id_idx on public.job_openings (client_id);
create index job_openings_position_id_idx on public.job_openings (position_id);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id),                           -- BR-08
  job_opening_id uuid not null references public.job_openings(id),                       -- BR-08
  status text not null default 'applied'
    check (status in ('applied','screening','interviewing','offered','hired','rejected','withdrawn')),
  applied_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- BR-09 (duplicate applications) is still "Pending Confirmation": deliberately NO unique constraint yet.
comment on table public.applications is 'BR-09 pending: no uniqueness on (candidate_id, job_opening_id) until the policy is confirmed.';
create index applications_candidate_id_idx on public.applications (candidate_id);
create index applications_job_opening_id_idx on public.applications (job_opening_id);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,    -- BR-10
  interviewer_id uuid not null references public.employees(id),                          -- BR-10
  scheduled_at timestamptz not null,                                                     -- BR-18
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled','no_show')),
  rating smallint check (rating is null or rating between 1 and 5),
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interviews_application_id_idx on public.interviews (application_id);
create index interviews_interviewer_id_idx on public.interviews (interviewer_id);
create index interviews_scheduled_at_idx on public.interviews (scheduled_at);

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null,                                                            -- path in Supabase Storage, never file bytes
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  uploaded_by uuid references public.user_accounts(user_id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index employee_documents_employee_id_idx on public.employee_documents (employee_id);
create index employee_documents_uploaded_by_idx on public.employee_documents (uploaded_by);

create table public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  uploaded_by uuid references public.user_accounts(user_id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index candidate_documents_candidate_id_idx on public.candidate_documents (candidate_id);
create index candidate_documents_uploaded_by_idx on public.candidate_documents (uploaded_by);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text,
  default_days_per_year numeric(5,1) check (default_days_per_year is null or default_days_per_year >= 0),
  is_paid boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leave_types_name_key on public.leave_types (lower(name));

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.user_accounts(user_id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_dates check (end_date >= start_date)                         -- BR-11
);
create index leave_requests_employee_id_idx on public.leave_requests (employee_id);
create index leave_requests_leave_type_id_idx on public.leave_requests (leave_type_id);
create index leave_requests_reviewed_by_idx on public.leave_requests (reviewed_by);
create index leave_requests_status_idx on public.leave_requests (status);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_accounts(user_id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- 5) updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['departments','positions','clients','candidates','employees','employee_compensation',
    'user_accounts','job_openings','applications','interviews','leave_types','leave_requests']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;

-- 6) Lock everything down by default (policies come in 003)
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

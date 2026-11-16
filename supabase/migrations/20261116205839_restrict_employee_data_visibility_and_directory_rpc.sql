-- Restrict recruiter access to a safe employee directory projection.
-- Preserve all employee records and existing documents. Existing documents remain
-- HR/Admin-only until explicitly marked employee_visible.

alter table public.employee_documents
  add column if not exists employee_visible boolean not null default false;

drop policy if exists employee_documents_select on public.employee_documents;
create policy employee_documents_select
on public.employee_documents
for select
to authenticated
using (
  (select private.has_role(array['admin'::text, 'hr_manager'::text]))
  or (
    employee_id = (select private.current_employee_id())
    and employee_visible is true
  )
);

drop policy if exists "employee documents read by HR or owner" on storage.objects;
create policy "employee documents read by HR or owner"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (
    select 1
    from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
  and (
    (select private.has_role(array['admin'::text, 'hr_manager'::text]))
    or (
      (storage.foldername(name))[1] = (select private.current_employee_id())::text
      and exists (
        select 1
        from public.employee_documents d
        where d.storage_path = storage.objects.name
          and d.employee_id = (select private.current_employee_id())
          and d.employee_visible is true
      )
    )
  )
);

drop policy if exists employees_select on public.employees;
create policy employees_select
on public.employees
for select
to authenticated
using (
  (select private.has_role(array['admin'::text, 'hr_manager'::text]))
  or id = (select private.current_employee_id())
);

create or replace function public.get_employee_directory()
returns table (
  id uuid,
  first_name text,
  last_name text,
  department_id uuid,
  position_id uuid,
  hire_date date,
  status text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    e.id,
    e.first_name,
    e.last_name,
    e.department_id,
    e.position_id,
    e.hire_date,
    e.status
  from public.employees e
  where
    (select private.has_role(array['admin'::text, 'hr_manager'::text, 'recruiter'::text]))
    or e.id = (select private.current_employee_id())
  order by e.last_name, e.first_name;
$function$;

revoke all on function public.get_employee_directory() from public;
revoke all on function public.get_employee_directory() from anon;
grant execute on function public.get_employee_directory() to authenticated;

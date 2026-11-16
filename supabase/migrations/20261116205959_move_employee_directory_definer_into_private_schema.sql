-- Keep the privileged data-access function out of the exposed API schema.
-- The public RPC is an invoker wrapper; the private implementation performs
-- the explicit role checks under a hardened SECURITY DEFINER context.

create or replace function private.get_employee_directory()
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

revoke all on function private.get_employee_directory() from public;
revoke all on function private.get_employee_directory() from anon;
grant execute on function private.get_employee_directory() to authenticated;

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
security invoker
set search_path = ''
as $function$
  select *
  from private.get_employee_directory();
$function$;

revoke all on function public.get_employee_directory() from public;
revoke all on function public.get_employee_directory() from anon;
grant execute on function public.get_employee_directory() to authenticated;

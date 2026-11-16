-- Add bounded, searchable pagination to the non-HR employee directory RPC.
-- The private SECURITY DEFINER implementation still returns only approved fields.

drop function if exists public.get_employee_directory();
drop function if exists private.get_employee_directory();

create function private.get_employee_directory(
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  department_id uuid,
  position_id uuid,
  hire_date date,
  status text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  with authorized_employees as (
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
  ),
  filtered_employees as (
    select *
    from authorized_employees
    where
      nullif(btrim(p_search), '') is null
      or first_name ilike '%' || btrim(p_search) || '%'
      or last_name ilike '%' || btrim(p_search) || '%'
  ),
  counted_employees as (
    select
      f.*,
      count(*) over () as total_count
    from filtered_employees f
  )
  select
    c.id,
    c.first_name,
    c.last_name,
    c.department_id,
    c.position_id,
    c.hire_date,
    c.status,
    c.total_count
  from counted_employees c
  order by c.last_name, c.first_name
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function private.get_employee_directory(integer, integer, text) from public;
revoke all on function private.get_employee_directory(integer, integer, text) from anon;
grant execute on function private.get_employee_directory(integer, integer, text) to authenticated;

create function public.get_employee_directory(
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  department_id uuid,
  position_id uuid,
  hire_date date,
  status text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select *
  from private.get_employee_directory(p_limit, p_offset, p_search);
$function$;

revoke all on function public.get_employee_directory(integer, integer, text) from public;
revoke all on function public.get_employee_directory(integer, integer, text) from anon;
grant execute on function public.get_employee_directory(integer, integer, text) to authenticated;

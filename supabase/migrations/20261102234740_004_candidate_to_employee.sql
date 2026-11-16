-- =====================================================================
-- 004: Candidate -> employee conversion (copies identity once, links via employees.candidate_id)
-- =====================================================================
create function public.convert_candidate_to_employee(
  p_candidate_id   uuid,
  p_department_id  uuid,
  p_position_id    uuid,
  p_hire_date      date default current_date,
  p_manager_id     uuid default null,
  p_salary         numeric default null,
  p_application_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  c public.candidates%rowtype;
  v_employee_id uuid;
begin
  -- Runs with the caller's rights, so RLS already limits this to admin/HR; check explicitly for a clear error.
  if not private.has_role(array['admin','hr_manager']) then
    raise exception 'Only admin or HR managers can convert candidates to employees';
  end if;

  select * into c from public.candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate % not found', p_candidate_id;
  end if;
  if exists (select 1 from public.employees where candidate_id = p_candidate_id) then
    raise exception 'Candidate % has already been converted to an employee', p_candidate_id;
  end if;

  insert into public.employees (candidate_id, first_name, last_name, email, phone,
                                department_id, position_id, manager_id, hire_date)
  values (c.id, c.first_name, c.last_name, c.email, c.phone,
          p_department_id, p_position_id, p_manager_id, p_hire_date)
  returning id into v_employee_id;

  if p_salary is not null then
    insert into public.employee_compensation (employee_id, salary, effective_date)
    values (v_employee_id, p_salary, p_hire_date);
  end if;

  update public.candidates set status = 'hired' where id = c.id;
  if p_application_id is not null then
    update public.applications set status = 'hired'
    where id = p_application_id and candidate_id = c.id;
  end if;

  return v_employee_id;
end $$;

revoke all on function public.convert_candidate_to_employee(uuid, uuid, uuid, date, uuid, numeric, uuid) from public, anon;
grant execute on function public.convert_candidate_to_employee(uuid, uuid, uuid, date, uuid, numeric, uuid) to authenticated;

-- Starter leave types (editable)
insert into public.leave_types (name, description, default_days_per_year, is_paid) values
  ('Vacation', 'Paid annual leave', 15, true),
  ('Sick',     'Paid sick leave',   10, true),
  ('Unpaid',   'Unpaid personal leave', null, false);

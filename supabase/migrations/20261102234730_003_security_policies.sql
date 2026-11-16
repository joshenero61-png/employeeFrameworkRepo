-- =====================================================================
-- 003: Role helpers, Row Level Security policies, audit triggers
-- =====================================================================

-- Helpers (private schema = not exposed through the Data API)
create function private.has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_role_assignments a
    join public.user_roles r on r.id = a.role_id
    join public.user_accounts u on u.user_id = a.user_id
    where a.user_id = (select auth.uid()) and u.is_active and r.name = any (p_roles)
  );
$$;

create function private.current_employee_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select employee_id from public.user_accounts
  where user_id = (select auth.uid()) and is_active;
$$;

revoke all on function private.has_role(text[]), private.current_employee_id() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_role(text[]), private.current_employee_id() to authenticated;

-- ---- Pattern A: reference data. Any active user reads; admin/HR write (user_roles: admin only)
do $$
declare t text; w text;
begin
  foreach t in array array['departments','positions','leave_types','user_roles'] loop
    w := case when t = 'user_roles' then '''admin''' else '''admin'',''hr_manager''' end;
    execute format('create policy %I on public.%I for select to authenticated using ((select private.has_role(array[''admin'',''hr_manager'',''recruiter'',''employee''])))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_role(array[%s])))', t||'_insert', t, w);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.has_role(array[%s]))) with check ((select private.has_role(array[%s])))', t||'_update', t, w, w);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_role(array[%s])))', t||'_delete', t, w);
  end loop;
end $$;

-- ---- Pattern B: recruitment data. Admin/HR/recruiter read+write; delete = admin/HR
do $$
declare t text;
begin
  foreach t in array array['clients','candidates','job_openings','applications','candidate_documents'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select private.has_role(array[''admin'',''hr_manager'',''recruiter''])))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_role(array[''admin'',''hr_manager'',''recruiter''])))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.has_role(array[''admin'',''hr_manager'',''recruiter'']))) with check ((select private.has_role(array[''admin'',''hr_manager'',''recruiter''])))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_role(array[''admin'',''hr_manager''])))', t||'_delete', t);
  end loop;
end $$;

-- ---- employees: staff see all, everyone sees self; admin/HR write
create policy employees_select on public.employees for select to authenticated
  using ((select private.has_role(array['admin','hr_manager','recruiter'])) or id = (select private.current_employee_id()));
create policy employees_insert on public.employees for insert to authenticated
  with check ((select private.has_role(array['admin','hr_manager'])));
create policy employees_update on public.employees for update to authenticated
  using ((select private.has_role(array['admin','hr_manager'])))
  with check ((select private.has_role(array['admin','hr_manager'])));
create policy employees_delete on public.employees for delete to authenticated
  using ((select private.has_role(array['admin','hr_manager'])));

-- ---- employee_compensation (BR-15): admin/HR only, every operation
create policy employee_compensation_all on public.employee_compensation for all to authenticated
  using ((select private.has_role(array['admin','hr_manager'])))
  with check ((select private.has_role(array['admin','hr_manager'])));

-- ---- employee_documents: admin/HR manage; employees read their own
create policy employee_documents_select on public.employee_documents for select to authenticated
  using ((select private.has_role(array['admin','hr_manager'])) or employee_id = (select private.current_employee_id()));
create policy employee_documents_insert on public.employee_documents for insert to authenticated
  with check ((select private.has_role(array['admin','hr_manager'])));
create policy employee_documents_update on public.employee_documents for update to authenticated
  using ((select private.has_role(array['admin','hr_manager'])))
  with check ((select private.has_role(array['admin','hr_manager'])));
create policy employee_documents_delete on public.employee_documents for delete to authenticated
  using ((select private.has_role(array['admin','hr_manager'])));

-- ---- interviews: staff manage; the assigned interviewer can read/update their own
create policy interviews_select on public.interviews for select to authenticated
  using ((select private.has_role(array['admin','hr_manager','recruiter'])) or interviewer_id = (select private.current_employee_id()));
create policy interviews_insert on public.interviews for insert to authenticated
  with check ((select private.has_role(array['admin','hr_manager','recruiter'])));
create policy interviews_update on public.interviews for update to authenticated
  using ((select private.has_role(array['admin','hr_manager','recruiter'])) or interviewer_id = (select private.current_employee_id()))
  with check ((select private.has_role(array['admin','hr_manager','recruiter'])) or interviewer_id = (select private.current_employee_id()));
create policy interviews_delete on public.interviews for delete to authenticated
  using ((select private.has_role(array['admin','hr_manager'])));

-- ---- leave_requests (BR-12): employees file/cancel their own pending requests; only admin/HR decide
create policy leave_requests_select on public.leave_requests for select to authenticated
  using ((select private.has_role(array['admin','hr_manager'])) or employee_id = (select private.current_employee_id()));
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check ((select private.has_role(array['admin','hr_manager']))
              or (employee_id = (select private.current_employee_id()) and status = 'pending'));
create policy leave_requests_update on public.leave_requests for update to authenticated
  using ((select private.has_role(array['admin','hr_manager']))
         or (employee_id = (select private.current_employee_id()) and status = 'pending'))
  with check ((select private.has_role(array['admin','hr_manager']))
              or (employee_id = (select private.current_employee_id()) and status in ('pending','cancelled')));
create policy leave_requests_delete on public.leave_requests for delete to authenticated
  using ((select private.has_role(array['admin','hr_manager']))
         or (employee_id = (select private.current_employee_id()) and status = 'pending'));

-- ---- user_accounts / user_role_assignments: self-read, admin (and HR for accounts) read, admin writes
create policy user_accounts_select on public.user_accounts for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role(array['admin','hr_manager'])));
create policy user_accounts_insert on public.user_accounts for insert to authenticated
  with check ((select private.has_role(array['admin'])));
create policy user_accounts_update on public.user_accounts for update to authenticated
  using ((select private.has_role(array['admin']))) with check ((select private.has_role(array['admin'])));
create policy user_accounts_delete on public.user_accounts for delete to authenticated
  using ((select private.has_role(array['admin'])));

create policy user_role_assignments_select on public.user_role_assignments for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role(array['admin'])));
create policy user_role_assignments_insert on public.user_role_assignments for insert to authenticated
  with check ((select private.has_role(array['admin'])));
create policy user_role_assignments_update on public.user_role_assignments for update to authenticated
  using ((select private.has_role(array['admin']))) with check ((select private.has_role(array['admin'])));
create policy user_role_assignments_delete on public.user_role_assignments for delete to authenticated
  using ((select private.has_role(array['admin'])));

-- ---- audit_logs: admin read only; nobody writes through the API (triggers write as definer)
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.has_role(array['admin'])));
revoke insert, update, delete, truncate on public.audit_logs from authenticated;

-- =====================================================================
-- Audit trigger (BR-16): employee changes, compensation, permission changes, leave decisions
-- =====================================================================
create function private.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  j_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  j jsonb := coalesce(j_new, j_old);
  v_key text;
  v_details jsonb;
  v_action text := lower(tg_op);
  v_ip inet;
  v_actor uuid := (select auth.uid());
begin
  v_key := case tg_table_name
    when 'user_role_assignments' then (j ->> 'user_id') || ':' || (j ->> 'role_id')
    when 'employee_compensation' then j ->> 'employee_id'
    when 'user_accounts' then j ->> 'user_id'
    else j ->> 'id' end;

  if tg_op = 'UPDATE' then
    v_details := jsonb_build_object('changes', (
      select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', j_old -> n.key, 'new', n.value)), '{}'::jsonb)
      from jsonb_each(j_new) n
      where n.key <> 'updated_at' and (j_old -> n.key) is distinct from n.value));
    if v_details -> 'changes' = '{}'::jsonb then return null; end if;
  elsif tg_op = 'INSERT' then
    v_details := jsonb_build_object('new', j_new);
  else
    v_details := jsonb_build_object('old', j_old);
  end if;

  if tg_table_name = 'leave_requests' and tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_action := case new.status when 'approved' then 'approve' when 'rejected' then 'reject'
                                 when 'cancelled' then 'cancel' else v_action end;
  end if;

  begin
    v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1)), '')::inet;
  exception when others then v_ip := null;
  end;

  if v_actor is not null and not exists (select 1 from public.user_accounts where user_id = v_actor) then
    v_actor := null;
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
  values (v_actor, v_action, tg_table_name, v_key, v_details, v_ip);
  return null;
end $$;
revoke all on function private.log_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['employees','employee_compensation','user_accounts','user_role_assignments','leave_requests'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.log_change()', t || '_audit', t);
  end loop;
end $$;

-- =====================================================================
-- Leave decision guard (BR-12, defense in depth): only admin/HR may approve/reject;
-- reviewer + timestamp are stamped by the database, not trusted from the client.
-- =====================================================================
create function private.guard_leave_decision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is not null and not private.has_role(array['admin','hr_manager']) then
    if new.status in ('approved','rejected') and new.status is distinct from old.status then
      raise exception 'Only admin or HR managers can approve or reject leave requests';
    end if;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_notes := old.review_notes;
  elsif new.status in ('approved','rejected') and new.status is distinct from old.status then
    new.reviewed_by := coalesce(v_actor, new.reviewed_by);
    new.reviewed_at := now();
  end if;
  return new;
end $$;
revoke all on function private.guard_leave_decision() from public, anon, authenticated;

create trigger leave_requests_guard_decision before update on public.leave_requests
  for each row execute function private.guard_leave_decision();

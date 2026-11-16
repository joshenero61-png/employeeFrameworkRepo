create function private.redact_audit(p_table text, p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_table = 'employee_compensation' and p_row is not null
              then (p_row - 'salary') || jsonb_build_object('salary', '[redacted]')
              else p_row end;
$$;

create or replace function private.log_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
      select coalesce(jsonb_object_agg(n.key, jsonb_build_object(
               'old', case when tg_table_name = 'employee_compensation' and n.key = 'salary'
                           then to_jsonb('[redacted]'::text) else j_old -> n.key end,
               'new', case when tg_table_name = 'employee_compensation' and n.key = 'salary'
                           then to_jsonb('[redacted]'::text) else n.value end)), '{}'::jsonb)
      from jsonb_each(j_new) n
      where n.key <> 'updated_at' and (j_old -> n.key) is distinct from n.value));
    if v_details -> 'changes' = '{}'::jsonb then return null; end if;
  elsif tg_op = 'INSERT' then
    v_details := jsonb_build_object('new', private.redact_audit(tg_table_name, j_new));
  else
    v_details := jsonb_build_object('old', private.redact_audit(tg_table_name, j_old));
  end if;

  if tg_table_name = 'leave_requests' and tg_op = 'UPDATE' then
    if (j_new ->> 'status') is distinct from (j_old ->> 'status') then
      v_action := case j_new ->> 'status'
                    when 'approved'  then 'approve'
                    when 'rejected'  then 'reject'
                    when 'cancelled' then 'cancel'
                    else v_action end;
    end if;
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
end $function$;

create trigger candidates_audit after insert or update or delete on public.candidates for each row execute function private.log_change();
create trigger applications_audit after insert or update or delete on public.applications for each row execute function private.log_change();
create trigger interviews_audit after insert or update or delete on public.interviews for each row execute function private.log_change();
create trigger job_openings_audit after insert or update or delete on public.job_openings for each row execute function private.log_change();
create trigger clients_audit after insert or update or delete on public.clients for each row execute function private.log_change();
create trigger departments_audit after insert or update or delete on public.departments for each row execute function private.log_change();
create trigger positions_audit after insert or update or delete on public.positions for each row execute function private.log_change();
create trigger employee_documents_audit after insert or update or delete on public.employee_documents for each row execute function private.log_change();
create trigger candidate_documents_audit after insert or update or delete on public.candidate_documents for each row execute function private.log_change();
create trigger leave_types_audit after insert or update or delete on public.leave_types for each row execute function private.log_change();
create trigger user_roles_audit after insert or update or delete on public.user_roles for each row execute function private.log_change();

create function private.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Only permitted change: deleting an account nulls the actor reference (FK ON DELETE SET NULL).
    if old.user_id is not null and new.user_id is null
       and (new.id, new.action, new.entity_type, new.entity_id, new.details, new.ip_address, new.created_at)
           is not distinct from
           (old.id, old.action, old.entity_type, old.entity_id, old.details, old.ip_address, old.created_at) then
      return new;
    end if;
  end if;
  raise exception 'audit_logs is append-only (% is not permitted)', tg_op using errcode = '42501';
end;
$$;
create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function private.audit_logs_immutable();
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.audit_logs_immutable();
revoke update, delete, truncate on public.audit_logs from anon, authenticated, service_role;

create index employees_status_idx on public.employees (status);
create index employees_name_idx on public.employees (lower(last_name), lower(first_name));
create index candidates_name_idx on public.candidates (lower(last_name), lower(first_name));
create index candidates_status_idx on public.candidates (status);
create index applications_status_idx on public.applications (status);
create index job_openings_status_idx on public.job_openings (status);
create index leave_requests_dates_idx on public.leave_requests (start_date, end_date);

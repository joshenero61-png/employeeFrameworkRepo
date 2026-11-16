-- Fix: log_change() referenced new.status / old.status on tables without a status column
-- (and old on INSERT). Read status from the jsonb copies instead, only for leave_requests updates.
create or replace function private.log_change() returns trigger
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
end $$;
revoke all on function private.log_change() from public, anon, authenticated;

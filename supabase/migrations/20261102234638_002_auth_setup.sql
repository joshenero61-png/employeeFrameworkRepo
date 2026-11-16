-- =====================================================================
-- 002: Roles seed, Supabase Auth -> user_accounts sync, legacy login backfill
-- =====================================================================

insert into public.user_roles (name, description) values
  ('admin',      'Full access, including user and role management and audit logs'),
  ('hr_manager', 'Manages employees, compensation, documents, and leave approvals'),
  ('recruiter',  'Manages clients, candidates, job openings, applications, and interviews'),
  ('employee',   'Self-service: own profile, own leave requests, assigned interviews');

-- Every new Supabase Auth user gets a profile row and the least-privileged role.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_employee uuid;
begin
  insert into public.user_accounts (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));

  insert into public.user_role_assignments (user_id, role_id)
  select new.id, id from public.user_roles where name = 'employee';
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill existing logins and map old roles: admin->admin, staff->hr_manager, viewer->employee
insert into public.user_accounts (user_id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (user_id) do nothing;

insert into public.user_role_assignments (user_id, role_id)
select a.user_id, r.id
from public.user_accounts a
left join public.legacy_role_map m on m.user_id = a.user_id
join public.user_roles r on r.name = case m.role
  when 'admin' then 'admin'
  when 'staff' then 'hr_manager'
  else 'employee' end
on conflict do nothing;

drop table public.legacy_role_map;

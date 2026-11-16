
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
    (select private.has_role(array['admin','hr_manager']))
    or (storage.foldername(name))[1] = (select private.current_employee_id())::text
  )
);

drop policy if exists "employee documents insert by HR" on storage.objects;
create policy "employee documents insert by HR"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and (select private.has_role(array['admin','hr_manager']))
  and exists (
    select 1
    from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "employee documents update by HR" on storage.objects;
create policy "employee documents update by HR"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'employee-documents'
  and (select private.has_role(array['admin','hr_manager']))
  and exists (
    select 1
    from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'employee-documents'
  and (select private.has_role(array['admin','hr_manager']))
  and exists (
    select 1
    from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "employee documents delete by HR" on storage.objects;
create policy "employee documents delete by HR"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'employee-documents'
  and (select private.has_role(array['admin','hr_manager']))
  and exists (
    select 1
    from public.employees e
    where e.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "candidate documents read by recruitment" on storage.objects;
create policy "candidate documents read by recruitment"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'candidate-documents'
  and (select private.has_role(array['admin','hr_manager','recruiter']))
  and exists (
    select 1
    from public.candidates c
    where c.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "candidate documents insert by recruitment" on storage.objects;
create policy "candidate documents insert by recruitment"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'candidate-documents'
  and (select private.has_role(array['admin','hr_manager','recruiter']))
  and exists (
    select 1
    from public.candidates c
    where c.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "candidate documents update by recruitment" on storage.objects;
create policy "candidate documents update by recruitment"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'candidate-documents'
  and (select private.has_role(array['admin','hr_manager','recruiter']))
  and exists (
    select 1
    from public.candidates c
    where c.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'candidate-documents'
  and (select private.has_role(array['admin','hr_manager','recruiter']))
  and exists (
    select 1
    from public.candidates c
    where c.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "candidate documents delete by HR" on storage.objects;
create policy "candidate documents delete by HR"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'candidate-documents'
  and (select private.has_role(array['admin','hr_manager']))
  and exists (
    select 1
    from public.candidates c
    where c.id::text = (storage.foldername(name))[1]
  )
);

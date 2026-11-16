create index employees_position_dept_idx on public.employees (position_id, department_id);
drop index public.employees_position_id_idx; -- redundant: the composite index leads with position_id

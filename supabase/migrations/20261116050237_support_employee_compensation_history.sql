
ALTER TABLE public.employee_compensation
  ADD COLUMN compensation_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.employee_compensation
  DROP CONSTRAINT employee_compensation_pkey;

ALTER TABLE public.employee_compensation
  ADD CONSTRAINT employee_compensation_pkey PRIMARY KEY (compensation_id);

ALTER TABLE public.employee_compensation
  ADD CONSTRAINT employee_compensation_employee_effective_date_key
  UNIQUE (employee_id, effective_date);

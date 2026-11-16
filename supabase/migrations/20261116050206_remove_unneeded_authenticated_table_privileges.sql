
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated',
      t.tablename
    );
  END LOOP;
END
$$;

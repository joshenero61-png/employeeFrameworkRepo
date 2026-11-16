
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated;


INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('employee-documents', 'employee-documents', false, 20971520,
   ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']),
  ('candidate-documents', 'candidate-documents', false, 20971520,
   ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "employee documents read by HR or owner"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (
    (SELECT private.has_role(ARRAY['admin','hr_manager']))
    OR (storage.foldername(name))[1] = (SELECT private.current_employee_id())::text
  )
);

CREATE POLICY "employee documents insert by HR"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager']))
  AND (storage.foldername(name))[1] IS NOT NULL
);

CREATE POLICY "employee documents update by HR"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager']))
)
WITH CHECK (
  bucket_id = 'employee-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager']))
);

CREATE POLICY "employee documents delete by HR"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager']))
);

CREATE POLICY "candidate documents read by recruitment"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager','recruiter']))
);

CREATE POLICY "candidate documents insert by recruitment"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager','recruiter']))
  AND (storage.foldername(name))[1] IS NOT NULL
);

CREATE POLICY "candidate documents update by recruitment"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager','recruiter']))
)
WITH CHECK (
  bucket_id = 'candidate-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager','recruiter']))
);

CREATE POLICY "candidate documents delete by HR"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'candidate-documents'
  AND (SELECT private.has_role(ARRAY['admin','hr_manager']))
);

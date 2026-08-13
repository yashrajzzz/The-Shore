-- Background folder policies: defaults/ (read-only) + users/{uid}/ (per-user library, max 5 enforced in app)

-- Drop the old permissive upload policy if it exists
DROP POLICY IF EXISTS "Authenticated users can upload backgrounds" ON storage.objects;

-- Users can upload only into their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'backgrounds'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Users can delete only from their own folder
CREATE POLICY "Users can delete from own folder"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'backgrounds'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

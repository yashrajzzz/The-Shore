-- Create a storage bucket for backgrounds
INSERT INTO storage.buckets (id, name, public) VALUES ('backgrounds', 'backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Anyone can read backgrounds
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'backgrounds' );

-- Storage Policy: Users can upload only into their own folder (users/{uid}/)
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'backgrounds'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Storage Policy: Users can delete only from their own folder
CREATE POLICY "Users can delete from own folder"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'backgrounds'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
);

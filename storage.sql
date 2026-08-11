-- Create a storage bucket for backgrounds
INSERT INTO storage.buckets (id, name, public) VALUES ('backgrounds', 'backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Anyone can read backgrounds
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'backgrounds' );

-- Storage Policy: Authenticated users can upload backgrounds
CREATE POLICY "Authenticated users can upload backgrounds" 
ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'backgrounds' 
    AND auth.role() = 'authenticated'
);

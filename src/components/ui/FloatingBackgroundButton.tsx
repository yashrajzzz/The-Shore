'use client';
import { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { setGlobalBackground } from './GlobalBackground';

export function FloatingBackgroundButton() {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const supabase = createClient();
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `lobby/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('backgrounds')
      .upload(filePath, file);

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message);
      setIsUploading(false);
      return;
    }

    const { data } = supabase.storage
      .from('backgrounds')
      .getPublicUrl(filePath);

    setGlobalBackground(data.publicUrl);
    setIsUploading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleUpload} 
        accept="image/*,video/mp4" 
        className="hidden" 
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="bg-coral hover:bg-coral-deep border-2 border-ink rounded-full w-12 h-12 flex items-center justify-center shadow-[4px_4px_0_var(--color-ink)] hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[5px_5px_0_var(--color-ink)] transition-all"
        title="Change Background"
      >
        {isUploading ? (
           <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin"></span>
        ) : (
           <span className="text-xl">🖼️</span>
        )}
      </button>
    </div>
  );
}

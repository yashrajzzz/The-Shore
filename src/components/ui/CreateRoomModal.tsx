'use client';

import { useState, useRef } from 'react';
import { Button } from './Button';
import { Window } from './Window';
import { createRoom } from '@/app/actions/rooms';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export function CreateRoomModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      if (files.length + selectedFiles.length > 5) {
        setError('You can only upload up to 5 backgrounds.');
        return;
      }
      setFiles(prev => [...prev, ...selectedFiles].slice(0, 5));
      setError('');
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError('');
    
    const formData = new FormData(e.currentTarget);
    const supabase = createClient();
    
    // Upload all files first
    const uploadedUrls: string[] = [];
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `rooms/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('backgrounds')
        .upload(filePath, file);

      if (uploadError) {
        setError('Failed to upload background: ' + uploadError.message);
        setIsPending(false);
        return;
      }

      const { data } = supabase.storage
        .from('backgrounds')
        .getPublicUrl(filePath);
        
      uploadedUrls.push(data.publicUrl);
    }
    
    // Append the urls to formData
    for (const url of uploadedUrls) {
      formData.append('background_urls', url);
    }

    const result = await createRoom(formData);
    
    if (result?.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
      setFiles([]);
    }
    
    setIsPending(false);
  }

  return (
    <>
      <Button variant="primary" className="px-6 py-2" onClick={() => setIsOpen(true)}>
        + Create Room
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md">
            <Window title="Create New Room">
              <div className="p-6">
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-ink-soft uppercase tracking-wider" htmlFor="name">Room Name</label>
                    <input 
                      id="name" 
                      name="name" 
                      type="text" 
                      required 
                      className="bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-2"
                      placeholder="e.g. #midnight-drive"
                      maxLength={32}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-ink-soft uppercase tracking-wider">Slideshow Backgrounds (Max 5)</label>
                    
                    <div className="flex flex-wrap gap-2 mb-2">
                      {files.map((file, i) => (
                        <div key={i} className="flex items-center gap-2 bg-cream border-2 border-ink rounded-full px-3 py-1 text-xs">
                          <span className="max-w-[100px] truncate">{file.name}</span>
                          <button type="button" onClick={() => removeFile(i)} className="text-coral hover:text-coral-deep font-bold">×</button>
                        </div>
                      ))}
                    </div>

                    {files.length < 5 && (
                      <Button 
                        type="button" 
                        variant="secondary" 
                        className="py-2 text-sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        + Select Image/Video/GIF
                      </Button>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange}
                      accept="image/*,video/mp4,video/webm"
                      multiple
                      className="hidden"
                    />
                    <p className="text-[10px] text-ink-soft font-mono mt-1">Backgrounds will crossfade every 30 seconds.</p>
                  </div>

                  {error && (
                    <div className="bg-pink border-2 border-ink p-2 mt-2 rounded text-xs text-center">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3 mt-4">
                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" className="flex-1" disabled={isPending}>
                      {isPending ? 'Uploading...' : 'Create'}
                    </Button>
                  </div>
                </form>
              </div>
            </Window>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './Button';
import { Window } from './Window';
import { createRoom } from '@/app/actions/rooms';
import { BackgroundPicker } from './BackgroundPicker';
import { MAX_BACKGROUNDS_PER_FOLDER } from '@/utils/backgrounds';

export function CreateRoomModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError('');

    const formData = new FormData(e.currentTarget);

    for (const url of selectedUrls) {
      formData.append('background_urls', url);
    }

    const result = await createRoom(formData);

    if (result?.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
      setSelectedUrls([]);
      // Navigate to the newly created room
      if (result?.room?.id) {
        router.push(`/room/${result.room.id}`);
      }
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
                      placeholder="e.g. #midnightdrive"
                      maxLength={32}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-ink-soft uppercase tracking-wider">
                      Slideshow Backgrounds (Max {MAX_BACKGROUNDS_PER_FOLDER})
                    </label>
                    <BackgroundPicker
                      selectedUrls={selectedUrls}
                      onSelectionChange={setSelectedUrls}
                      maxSelection={MAX_BACKGROUNDS_PER_FOLDER}
                      compact
                    />
                    <p className="text-[10px] text-ink-soft font-mono mt-1">
                      Pick from defaults or your library. Backgrounds crossfade every 30 seconds.
                    </p>
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
                      {isPending ? 'Creating...' : 'Create'}
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

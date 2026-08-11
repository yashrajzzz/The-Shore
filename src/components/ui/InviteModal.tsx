'use client';

import { useState, useRef } from 'react';
import { Window } from './Window';
import { Button } from './Button';

export function InviteModal({ roomId, roomName }: { roomId: string; roomName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : `/room/${roomId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select input text
      inputRef.current?.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" className="px-6 py-2" onClick={() => setIsOpen(true)}>
        + Invite Friends
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md">
            <Window title="Invite Friends">
              <div className="p-6">
                <div className="mb-3 text-sm font-mono text-ink-soft">Share this link to invite others to the room{roomName ? ` — ${roomName}` : ''}:</div>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                  />
                  <Button type="button" variant="primary" onClick={handleCopy} className="px-3">
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>

                <div className="mt-4 text-xs text-ink-soft">Or send an email invite:</div>
                <div className="mt-2 flex gap-2">
                  <a
                    href={`mailto:?subject=${encodeURIComponent('Join my room on The Shore')}&body=${encodeURIComponent(`Join me in the room${roomName ? ` '${roomName}'` : ''}: ${shareUrl}`)}`}
                    className="inline-block"
                  >
                    <Button type="button" variant="secondary">Email Invite</Button>
                  </a>

                  <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} className="ml-auto">Close</Button>
                </div>
              </div>
            </Window>
          </div>
        </div>
      )}
    </>
  );
}

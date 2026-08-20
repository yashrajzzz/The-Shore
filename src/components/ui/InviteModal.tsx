'use client';

import { useState, useRef, useEffect } from 'react';
import { Window } from './Window';
import { Button } from './Button';
import { Copy, Check, MessageCircle, Mail, X, Share2 } from 'lucide-react';

export function InviteModal({ roomId, roomName }: { roomId: string; roomName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Detect navigator.share client-side only to avoid SSR hydration mismatch
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : `/room/${roomId}`;
  const shareText = `Join me on The Shore${roomName ? ` in room '${roomName}'` : ''}! 🎵`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select input text
      inputRef.current?.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join The Shore',
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // user cancelled share
      }
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent('Join my room on The Shore')}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`;

  return (
    <>
      <Button type="button" variant="secondary" className="px-6 py-2" onClick={() => setIsOpen(true)}>
        <Share2 size={12} className="mr-1.5" /> Invite Friends
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md">
            <Window title="Invite Friends">
              <div className="p-6">
                <div className="mb-4 text-sm font-mono text-ink-soft">
                  Share this link to invite others{roomName ? ` to ${roomName}` : ''}:
                </div>

                {/* Copy link row */}
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-sm font-mono focus:outline-none select-all"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={handleCopy}
                    className={`px-3 py-2 rounded-lg border-[2px] border-ink font-mono text-xs font-bold flex items-center gap-1.5 transition-all shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] ${
                      copied
                        ? 'bg-teal-2 text-ink'
                        : 'bg-coral text-ink'
                    }`}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {/* Share buttons */}
                <div className="mt-5 flex flex-wrap gap-2">
                  {/* WhatsApp */}
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                    <button className="flex items-center gap-1.5 bg-[#25D366] text-white border-[2px] border-ink rounded-lg px-3 py-2 text-xs font-mono font-bold shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all">
                      <MessageCircle size={14} /> WhatsApp
                    </button>
                  </a>

                  {/* Email */}
                  <a href={emailUrl} className="inline-block">
                    <button className="flex items-center gap-1.5 bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-xs font-mono font-bold shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all">
                      <Mail size={14} /> Email
                    </button>
                  </a>

                  {/* Native Share (mobile) */}
                  {canNativeShare && (
                    <button
                      onClick={handleNativeShare}
                      className="flex items-center gap-1.5 bg-yellow border-[2px] border-ink rounded-lg px-3 py-2 text-xs font-mono font-bold shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all"
                    >
                      <Share2 size={14} /> Share
                    </button>
                  )}

                  {/* Close */}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="ml-auto flex items-center gap-1.5 bg-cream border-[2px] border-ink rounded-lg px-3 py-2 text-xs font-mono font-bold shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all"
                  >
                    <X size={14} /> Close
                  </button>
                </div>
              </div>
            </Window>
          </div>
        </div>
      )}
    </>
  );
}


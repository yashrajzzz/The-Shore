'use client';

import { useRef, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { getPersonalBackgroundUrls, setGlobalBackground } from './GlobalBackground';
import { BackgroundPickerModal } from './BackgroundPicker';

function spark(button: HTMLButtonElement) {
  const rect = button.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 8;

  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    const angle = (Math.PI * 2 * i) / count;
    const dist = 22 + Math.random() * 12;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    s.style.position = 'fixed';
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.width = '5px';
    s.style.height = '5px';
    s.style.borderRadius = '1px';
    s.style.background = 'var(--color-coral-deep)';
    s.style.border = '1px solid var(--color-ink)';
    s.style.pointerEvents = 'none';
    s.style.zIndex = '200';
    s.style.animation = 'bg-dial-spark .5s ease-out forwards';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 550);
  }
}

export function FloatingBackgroundButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentUrls, setCurrentUrls] = useState<string[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleOpen = () => {
    if (buttonRef.current) spark(buttonRef.current);
    setCurrentUrls(getPersonalBackgroundUrls());
    setIsOpen(true);
  };

  const handleApply = (urls: string[]) => {
    setGlobalBackground(urls);
  };

  return (
    <>
      <div className="group fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 sm:bottom-6 sm:right-6">
        <div className="pointer-events-none absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-md border-2 border-ink bg-ink px-2.5 py-1.5 font-mono text-[10px] font-bold text-paper opacity-0 shadow-[2px_2px_0_var(--color-coral)] transition-all duration-150 group-hover:opacity-100 group-hover:-translate-y-0">
          Change Background
        </div>
        <button
          ref={buttonRef}
          onClick={handleOpen}
          style={{ animation: 'bg-dial-bob 3.2s ease-in-out infinite' }}
          className="[animation-play-state:running] group-hover:[animation-play-state:paused] flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border-2 border-ink bg-coral shadow-[4px_4px_0_var(--color-ink)] transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-1.5 hover:scale-110 hover:rotate-3 hover:shadow-[6px_6px_0_var(--color-ink)] active:scale-95 active:rotate-0"
          title="Change Background"
          aria-label="Change background"
        >
          <ImageIcon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
        </button>
      </div>

      <BackgroundPickerModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onApply={handleApply}
        initialSelected={currentUrls}
      />
    </>
  );
}

'use client';

import { useState } from 'react';
import { setGlobalBackground } from './GlobalBackground';
import { BackgroundPickerModal } from './BackgroundPicker';

function readSavedBackgroundUrls(): string[] {
  if (typeof window === 'undefined') return [];
  const saved = localStorage.getItem('shore_bg');
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.urls) return parsed.urls;
  } catch {
    return [saved];
  }
  return [];
}

export function FloatingBackgroundButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentUrls, setCurrentUrls] = useState<string[]>([]);

  const handleOpen = () => {
    setCurrentUrls(readSavedBackgroundUrls());
    setIsOpen(true);
  };

  const handleApply = (urls: string[]) => {
    setGlobalBackground(urls);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={handleOpen}
          className="bg-coral hover:bg-coral-deep border-2 border-ink rounded-full w-12 h-12 flex items-center justify-center shadow-[4px_4px_0_var(--color-ink)] hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[5px_5px_0_var(--color-ink)] transition-all"
          title="Change Background"
        >
          <span className="text-xl">🖼️</span>
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

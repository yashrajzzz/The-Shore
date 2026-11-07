'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/utils/supabase/client';

/**
 * Live "active users" count. Every visitor joins one shared realtime presence
 * channel; the number of distinct connections is the count. Nothing is stored
 * and no personal data is sent — each tab just announces that it's here.
 */
export function ActiveUsers({ className = '' }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('site-presence', {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        setCount(Object.keys(channel.presenceState()).length);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') await channel.track({ at: Date.now() });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Nothing until the first sync — avoids flashing a wrong "0".
  if (count === null) return null;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border-2 border-cream/40 bg-ink/40 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-cream backdrop-blur-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-2 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-2" />
      </span>
      active users: {count}
    </div>
  );
}

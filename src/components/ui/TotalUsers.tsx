'use client';

import { useEffect, useState } from 'react';

import { getTotalUsersCount } from '@/app/actions/stats';

interface TotalUsersProps {
  className?: string;
}

/**
 * Displays total registered users/listeners on The Shore.
 */
export function TotalUsers({ className = '' }: TotalUsersProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    getTotalUsersCount().then((res) => {
      if (isMounted && res.count !== null) {
        setCount(res.count);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

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
      {count.toLocaleString()} {count === 1 ? 'member joined' : 'members joined'}
    </div>
  );
}

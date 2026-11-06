'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

export function Taskbar() {
  const [time, setTime] = useState<string>('');
  const isHome = usePathname() === '/';

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      let h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      setTime(`${h}:${m} ${ampm}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`relative z-50 flex items-center justify-between px-3 sm:px-[18px] pb-[9px] ${isHome ? 'pt-4' : 'pt-[calc(9px+env(safe-area-inset-top))]'} bg-cream/40 backdrop-blur-md ${isHome ? '' : 'border-b-[2.5px] border-ink'}`}>
      <div className="flex min-w-0 items-center gap-5">
        <Link href="/" className="flex items-center gap-2 sm:gap-3">
          <Image src="/bunny-favicon.png" alt="Bunny Logo" width={48} height={48} className="h-9 w-9 sm:h-12 sm:w-12 object-contain" />
          <Image src="/the-shore-logo.png" alt="The Shore" width={120} height={40} className="h-auto w-[88px] sm:w-[120px] object-contain" />
        </Link>
      </div>
      <div className="flex items-center gap-[14px] text-[13px]">
        {/* Placeholder for now playing tick */}
        <div className="hidden md:flex items-center gap-[7px] bg-paper border-2 border-ink rounded-full px-3 py-1 shadow-[2px_2px_0_var(--color-ink)]">
          <span className="w-2 h-2 rounded-full bg-coral-deep animate-pulse block"></span>
          Welcome
        </div>
        <div className="font-pixel text-[18px] sm:text-[22px] sm:min-w-[78px] text-right shrink-0">
          {time}
        </div>
      </div>
    </div>
  );
}

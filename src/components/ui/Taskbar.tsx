'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export function Taskbar() {
  const [time, setTime] = useState<string>('');

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
    <div className="relative z-50 flex items-center justify-between px-[18px] py-[9px] bg-cream/40 backdrop-blur-md border-b-[2.5px] border-ink">
      <div className="flex items-center gap-5">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/bunny-favicon.png" alt="Bunny Logo" width={48} height={48} className="object-contain" />
          <Image src="/the-shore-logo.png" alt="The Shore" width={120} height={40} className="object-contain" />
        </Link>
        <div className="hidden sm:flex gap-4 text-[13px] text-ink-soft font-mono">
          <Link href="/lobby" className="hover:text-ink hover:underline font-bold text-ink">My Rooms</Link>
          <span className="cursor-not-allowed opacity-50">Queue</span>
        </div>
      </div>
      <div className="flex items-center gap-[14px] text-[13px]">
        {/* Placeholder for now playing tick */}
        <div className="hidden md:flex items-center gap-[7px] bg-paper border-2 border-ink rounded-full px-3 py-1 shadow-[2px_2px_0_var(--color-ink)]">
          <span className="w-2 h-2 rounded-full bg-coral-deep animate-pulse block"></span>
          Welcome
        </div>
        <div className="font-pixel text-[22px] min-w-[78px] text-right">
          {time}
        </div>
      </div>
    </div>
  );
}

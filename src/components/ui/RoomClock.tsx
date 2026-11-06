'use client';
import { useEffect, useState } from 'react';

/** Desktop-only (phones already show the time in their status bar). Always-visible clock for the room screen (the Taskbar clock isn't shown inside rooms / when maximized). */
export function RoomClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    };
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="hidden sm:flex h-12 min-w-[84px] px-3.5 bg-paper/60 backdrop-blur-md border-[2.5px] border-ink rounded-xl shadow-[4px_4px_0_var(--color-ink)] items-center justify-center font-pixel text-xl text-ink select-none"
      aria-label="Current time"
    >
      {time || ' '}
    </div>
  );
}

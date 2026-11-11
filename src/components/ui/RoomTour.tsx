'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Tour, type TourStep } from './Tour';
import { markTourSeen } from '@/app/actions/tour';

type Tab = 'listeners' | 'queue' | 'chat' | 'backgrounds';

/**
 * Room walkthrough for first-time users, plus a "?" button to replay it.
 * The room owns the sidebar, so it hands us two callbacks to drive it.
 */
export function RoomTour({
  initiallyUnseen,
  openSidebar,
  closeSidebar,
}: {
  initiallyUnseen: boolean;
  openSidebar: (tab: Tab) => void;
  closeSidebar: () => void;
}) {
  const [active, setActive] = useState(false);

  // Wait for the room-entry transition and audio prompt to settle first.
  useEffect(() => {
    if (!initiallyUnseen) return;
    const t = window.setTimeout(() => setActive(true), 1800);
    return () => window.clearTimeout(t);
  }, [initiallyUnseen]);

  const steps = useMemo<TourStep[]>(
    () => [
      {
        target: 'player',
        title: 'one song, everyone',
        body: 'Everyone in the room hears the same song at the same moment, and play, pause and skip apply to all of you. Volume is the one thing that is just yours.',
        onEnter: closeSidebar,
      },
      {
        target: 'queue-search',
        placement: 'left',
        title: 'add songs here',
        body: 'Search for a song and add it. It joins the queue and plays for the whole room.',
        onEnter: () => openSidebar('queue'),
      },
      {
        target: 'invite',
        placement: 'left',
        title: 'bring friends',
        body: 'Copy this invite link and send it. When they open it and sign in, they land here, in sync with you.',
        onEnter: () => openSidebar('listeners'),
      },
      {
        target: 'tabs',
        placement: 'left',
        title: 'and a bit more',
        body: 'Chat and your own backgrounds live in these tabs too. Tap the ? button any time to see this tour again.',
        onEnter: () => openSidebar('chat'),
      },
    ],
    [openSidebar, closeSidebar]
  );

  const finish = useCallback(() => {
    setActive(false);
    closeSidebar();
    void markTourSeen('room');
  }, [closeSidebar]);

  return (
    <>
      <button
        type="button"
        onClick={() => setActive(true)}
        aria-label="Replay the tour"
        title="Replay the tour"
        className="w-11 h-11 sm:w-12 sm:h-12 bg-paper/60 backdrop-blur-md border-[2.5px] border-ink rounded-xl shadow-[3px_3px_0_var(--color-ink)] sm:shadow-[4px_4px_0_var(--color-ink)] flex items-center justify-center hover:bg-teal-1 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)] transition-all z-[60]"
      >
        <CircleHelp size={19} strokeWidth={2.25} />
      </button>
      {active && <Tour steps={steps} onDone={finish} />}
    </>
  );
}

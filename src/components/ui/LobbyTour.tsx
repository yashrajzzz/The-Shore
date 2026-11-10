'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Tour, type TourStep } from './Tour';
import { markTourSeen } from '@/app/actions/tour';

const STEPS: TourStep[] = [
  {
    title: 'welcome to the shore',
    body: 'A room is a shared listening space: everyone inside hears the same song at the same time. Here is a 30-second look around.',
  },
  {
    target: 'create-room',
    title: 'start a room',
    body: 'Name a room and you become its host. This is the first thing to do.',
  },
  {
    target: 'playlists',
    title: 'save playlists',
    body: 'Keep your favourite songs together here, then drop a whole playlist into any room in one go.',
  },
];

/**
 * Lobby walkthrough for first-time users, plus a small "?" button to replay it.
 * `initiallyUnseen` comes from the server (the account's saved flag), so the
 * tour is decided before the page renders and never flashes for returning users.
 */
export function LobbyTour({ initiallyUnseen }: { initiallyUnseen: boolean }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!initiallyUnseen) return;
    const t = window.setTimeout(() => setActive(true), 700);
    return () => window.clearTimeout(t);
  }, [initiallyUnseen]);

  const finish = useCallback(() => {
    setActive(false);
    void markTourSeen('lobby');
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setActive(true)}
        aria-label="Replay the tour"
        title="Replay the tour"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper shadow-[2px_2px_0_var(--color-ink)] hover:bg-teal-1"
      >
        <CircleHelp size={16} strokeWidth={2.25} />
      </button>
      {active && <Tour steps={STEPS} onDone={finish} />}
    </>
  );
}

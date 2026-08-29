'use client';

import Link from 'next/link';
import { useRoomTransition } from './RoomTransition';

export function RoomCardLink({ href, className, children }: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { enterRoom } = useRoomTransition();

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // Let modifier-clicks, middle-click, and right-click behave normally
        // (open in new tab, etc.) — only intercept a plain left click so we
        // can cover the screen with the wave before the room mounts.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        enterRoom(href);
      }}
    >
      {children}
    </Link>
  );
}

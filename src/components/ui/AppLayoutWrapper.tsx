'use client';
import { usePathname } from 'next/navigation';
import { Taskbar } from './Taskbar';
import { FloatingBackgroundButton } from './FloatingBackgroundButton';

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRoom = pathname?.startsWith('/room/');

  return (
    <>
      {!isRoom && <Taskbar />}
      <main className={`flex-1 flex flex-col relative w-full min-h-0 ${!isRoom ? 'pt-[53px]' : ''}`}>
        {children}
      </main>
      {!isRoom && <FloatingBackgroundButton />}
    </>
  );
}

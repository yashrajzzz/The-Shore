'use client';
import { usePathname } from 'next/navigation';
import { Taskbar } from './Taskbar';
import { FloatingBackgroundButton } from './FloatingBackgroundButton';
import { FullscreenToggleButton } from './FullscreenToggleButton';
import { PageTransition } from './PageTransition';

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRoom = pathname?.startsWith('/room/');
  const isHome = pathname === '/';
  const isAuthPage = isHome || pathname?.startsWith('/login') || pathname?.startsWith('/auth');

  return (
    <>
      {!isRoom && !isHome && <Taskbar />}
      <main className={`flex-1 flex flex-col relative w-full min-h-0 ${!isRoom ? `${isHome ? '' : 'pt-[53px] '}overflow-y-auto overflow-x-hidden` : ''}`}>
        <PageTransition>{children}</PageTransition>
      </main>
      {!isRoom && !isAuthPage && <FloatingBackgroundButton />}
      <FullscreenToggleButton />
    </>
  );
}

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

const EASE = [0.22, 1, 0.36, 1] as const;

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRoom = pathname?.startsWith('/room/');
  // A leftover `filter` (even blur(0px)) promotes the page to a heavy layer and makes the
  // scroll-driven landing hero stutter, so the home route fades without blur.
  const blur = (v: string) => (pathname === '/' ? {} : { filter: v });

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, scale: isRoom ? 1.04 : 0.99, ...blur('blur(6px)') }}
        animate={{ opacity: 1, scale: 1, ...blur('blur(0px)') }}
        exit={{ opacity: 0, scale: isRoom ? 0.97 : 1.01, ...blur('blur(6px)') }}
        transition={{ duration: isRoom ? 0.5 : 0.3, ease: EASE }}
        className="flex min-h-0 w-full flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

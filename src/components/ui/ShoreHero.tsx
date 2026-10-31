import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from './Button';

export function ShoreHero() {
  return (
    <section className="@container relative h-full min-h-[440px] w-full shrink-0 overflow-hidden bg-ink text-cream">
      <Image
        src="/hero/shore-bg.webp"
        alt=""
        fill
        unoptimized
        sizes="100vw"
        className="shore-drift hidden object-cover object-[50%_40%] md:block"
      />
      <Image
        src="/hero/shore-bg-mobile.jpg"
        alt=""
        fill
        unoptimized
        sizes="100vw"
        className="shore-drift object-cover object-top md:hidden"
      />
      {/* keeps the title and buttons readable on top of the photo */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-30% via-ink/55 via-60% to-ink/95 md:from-ink/50 md:via-ink/10 md:to-ink/80" />

      <div className="relative z-10 flex h-full flex-col items-center justify-end md:justify-center gap-[2dvh] px-6 pb-14 text-center">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.35em] text-cream/80">
          listening rooms
        </span>

        <h1
          className="font-pixel lowercase leading-[0.85] text-cream [text-shadow:4px_4px_0_var(--color-coral)]"
          style={{ fontSize: 'min(22cqw, 24dvh)' }}
        >
          the shore
        </h1>

        <p className="max-w-md font-serif text-base italic leading-relaxed text-cream/90 sm:text-lg">
          a place where the music never stops. queue a song, share the aux, and let the night drift in
          — together, wherever you are.
        </p>

        <div className="mt-2 flex w-full max-w-xs gap-3">
          <Link href="/login" className="flex-1">
            <Button variant="primary" className="w-full py-3 text-sm">
              Log In
            </Button>
          </Link>
          <Link href="/login?mode=signup" className="flex-1">
            <Button
              variant="secondary"
              className="w-full rounded-full border-cream bg-transparent py-3 text-sm text-cream hover:bg-cream/15"
            >
              Sign Up
            </Button>
          </Link>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center text-cream/70">
        <ChevronDown size={22} strokeWidth={2.5} className="animate-bounce" />
      </div>
    </section>
  );
}

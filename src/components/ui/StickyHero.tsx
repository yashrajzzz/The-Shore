'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';

import { Button } from './Button';

const CARDS = [
  { src: '/hero/hero-1.webp', alt: 'Music is better together' },
  { src: '/hero/hero-2.webp', alt: 'Hero scene 2' },
  { src: '/hero/hero-3.webp', alt: 'Hero scene 3' },
  { src: '/hero/hero-4.webp', alt: 'Hero scene 4' },
  { src: '/hero/hero-5.webp', alt: 'Your next song starts here' },
];

export function StickyHero() {
  const container = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hintRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger);

      const root = container.current;
      const cards = cardRefs.current;
      if (!root || !cards[0]) return;

      // The app scrolls inside <main>, not the window.
      const scroller = root.closest('main') ?? undefined;

      // One "page" = the scroller's visible height (the taskbar eats into 100dvh).
      const syncStageHeight = () => {
        const pad = scroller ? parseFloat(getComputedStyle(scroller).paddingTop) || 0 : 0;
        const h = scroller?.clientHeight ?? window.innerHeight;
        root.style.setProperty('--stage-top', `-${pad}px`);
        root.style.setProperty('--stage-h', `${h}px`);
        ScrollTrigger.refresh();
      };
      syncStageHeight();
      const resizeObserver = new ResizeObserver(syncStageHeight);
      if (scroller) resizeObserver.observe(scroller);

      gsap.set(cards[0], { yPercent: 0, scale: 1, rotation: 0 });
      // Cards 2+ start hidden in the markup so they never flash before hydration.
      cards.slice(1).forEach((card) => gsap.set(card, { yPercent: 100, autoAlpha: 1 }));

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          scroller,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.3,
          onUpdate: (self) => {
            if (hintRef.current) hintRef.current.style.opacity = self.progress > 0.02 ? '0' : '1';
          },
        },
      });

      for (let i = 0; i < cards.length - 1; i++) {
        timeline.to(cards[i], { scale: 0.7, rotation: 5, duration: 1, ease: 'none', force3D: true }, i);
        timeline.to(cards[i + 1], { yPercent: 0, duration: 1, ease: 'none', force3D: true }, i);
      }

      return () => resizeObserver.disconnect();
    },
    { scope: container },
  );

  return (
    <div
      ref={container}
      className="hero-root relative w-full shrink-0"
      style={{ height: `calc(var(--stage-h, 100dvh) * ${CARDS.length})` }}
    >
      <div className="sticky top-[var(--stage-top,0px)] flex h-[var(--stage-h,100dvh)] w-full items-center justify-center overflow-hidden px-3 pb-6 pt-3 lg:px-4">
        <div className="relative mx-auto h-full w-full overflow-hidden rounded-4xl md:h-auto md:aspect-[22/10] md:w-[min(100%,calc((var(--stage-h,100dvh)-2.5rem)*2.2))]">
          {CARDS.map((card, i) => (
            <div
              key={card.src}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className={`absolute inset-0 overflow-hidden rounded-4xl will-change-transform ${i > 0 ? 'invisible' : ''}`}
            >
              {/* Phones: the art is landscape with its caption baked in, so show it whole over a blurred copy. */}
              <Image
                src={card.src}
                alt=""
                fill
                unoptimized
                sizes="100vw"
                className="scale-125 object-cover blur-2xl md:hidden"
              />
              <Image
                src={card.src}
                alt={card.alt}
                fill
                priority={i === 0}
                unoptimized
                loading="eager"
                sizes="100vw"
                className="object-contain md:object-cover md:object-[50%_30%]"
              />
              {i === CARDS.length - 1 && (
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-black/50 to-transparent px-4 pb-[6%] pt-16">
                  <div className="flex w-full max-w-xs gap-3 sm:max-w-sm sm:gap-4">
                    <Link href="/login" className="flex-1">
                      <Button variant="primary" className="w-full py-2 text-xs sm:py-3 sm:text-sm">
                        Log In
                      </Button>
                    </Link>
                    <Link href="/login?mode=signup" className="flex-1">
                      <Button
                        variant="secondary"
                        className="w-full rounded-full border-[2px] py-2 text-xs text-ink hover:bg-cream sm:py-3 sm:text-sm"
                      >
                        Sign Up
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div
          ref={hintRef}
          className="pointer-events-none absolute inset-x-0 bottom-9 flex justify-center transition-opacity duration-300"
        >
          <div className="flex flex-col items-center gap-0.5 text-xs font-bold uppercase tracking-[0.2em] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.85)] [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.8))]">
            scroll down
            <ChevronDown size={18} strokeWidth={2.5} className="animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  );
}

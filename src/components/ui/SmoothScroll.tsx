'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { useEffect, useRef } from 'react';

// The app scrolls inside <main>, not the window, so Lenis is pointed at that
// element. It is driven from GSAP's ticker so ScrollTrigger stays in step.
export function SmoothScroll() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const main = marker.current?.closest('main');
    const content = main?.firstElementChild;
    if (!main || !(content instanceof HTMLElement)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ wrapper: main, content, lerp: 0.09, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return <span ref={marker} hidden />;
}

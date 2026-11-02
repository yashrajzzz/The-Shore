import { Headphones, ListMusic, Radio } from 'lucide-react';
import Link from 'next/link';

import { Button } from './Button';

const STEPS = [
  { Icon: Radio, tint: 'bg-teal-2', title: 'open a room', body: 'start a listening room in a tap and invite whoever you like.' },
  { Icon: ListMusic, tint: 'bg-coral', title: 'queue the songs', body: 'everyone adds tracks, the room plays them in sync.' },
  { Icon: Headphones, tint: 'bg-yellow', title: 'listen together', body: 'chat, react, and let the night drift in, wherever you are.' },
];

// Phone-only replacement for the scroll-stack of cards, which doesn't suit portrait screens.
export function MobileIntro() {
  return (
    <section className="flex w-full shrink-0 flex-col gap-5 bg-cream px-5 pb-12 pt-10">
      <h2 className="text-center font-pixel text-[34px] leading-none text-ink">how it works</h2>

      {STEPS.map((s, i) => (
        <div
          key={s.title}
          className={`flex items-center gap-4 rounded-2xl border-[2.5px] border-ink p-3 shadow-[4px_4px_0_var(--color-ink)] ${s.tint}`}
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-[2px] border-ink bg-paper">
            <s.Icon size={28} strokeWidth={2.2} className="text-ink" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">step {i + 1}</p>
            <p className="font-pixel text-[26px] leading-none text-ink">{s.title}</p>
            <p className="mt-1 font-serif text-[13px] italic leading-snug text-ink-soft">{s.body}</p>
          </div>
        </div>
      ))}

      <div className="mt-4 flex gap-3">
        <Link href="/login" className="flex-1">
          <Button variant="primary" className="w-full py-3 text-sm">
            Log In
          </Button>
        </Link>
        <Link href="/login?mode=signup" className="flex-1">
          <Button variant="secondary" className="w-full rounded-full border-[2px] py-3 text-sm hover:bg-teal-1">
            Sign Up
          </Button>
        </Link>
      </div>
    </section>
  );
}

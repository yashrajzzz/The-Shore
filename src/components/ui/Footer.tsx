import Image from 'next/image';
import Link from 'next/link';

const LINKS = [
  { href: '/login', label: 'Log In' },
  { href: '/login?mode=signup', label: 'Sign Up' },
];

export function Footer() {
  return (
    <footer className="w-full shrink-0 border-t-[2.5px] border-ink bg-ink px-6 pb-8 pt-12 text-cream">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-sm flex-col gap-4">
          <div className="flex items-center gap-3">
            <Image src="/bunny-favicon.png" alt="" width={44} height={44} className="object-contain" />
            <span className="font-pixel text-[40px] lowercase leading-none [text-shadow:3px_3px_0_var(--color-coral-deep)]">
              the shore
            </span>
          </div>
          <p className="font-serif text-sm italic leading-relaxed text-cream/75">
            a place where the music never stops. queue a song, share the aux, and let the night drift in.
          </p>
        </div>

        <nav className="flex flex-col gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em]">
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="text-cream/80 transition-colors hover:text-coral">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-auto mt-10 flex max-w-5xl flex-col gap-1 border-t border-cream/15 pt-5 font-mono text-[11px] text-cream/50 sm:flex-row sm:justify-between">
        <span>&copy; {new Date().getFullYear()} The Shore. All rights reserved.</span>
        <span>made for listening together.</span>
      </div>
    </footer>
  );
}

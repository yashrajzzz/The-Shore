'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

type WavePhase = 'idle' | 'rising' | 'covered' | 'receding';
type Variant = 'enter' | 'exit';

const EASE = [0.22, 1, 0.36, 1] as const;
const RISE_MS = 450;
const RECEDE_MS = 450;
// Deliberately slow — a leisurely top-to-bottom wave fill reads as
// aesthetic rather than a snappy progress bar.
const FILL_MS = 1700;
const MIN_COVERED_MS = FILL_MS + 200;

// public/room-transition-bg.gif — ambient loop shown behind the wordmark
// on the way IN to a room. public/room-exit-bg.jpg — the still shown on
// the way OUT. Either falls back to an animated gradient if missing.
const ENTER_BG_SRC = '/room-transition-bg.gif';
const EXIT_BG_SRC = '/room-exit-bg.jpg';
const EXIT_LINES_DEFAULT = ['Thanks for', 'tuning in'];

// Top-to-bottom "liquid fill" clip for the wordmark: a wavy crest line,
// where everything from the top of the box down to the crest is revealed.
// Moving the crest's baseline from above the box (nothing revealed) to
// below it (fully revealed) sweeps the fill downward.
const WAVE_X = [-10, 0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100, 110];
const WAVE_OFFSET = [0, 6, 0, -6, 0, 6, 0, -6, 0, 6, 0];

function waveClipPath(baseline: number) {
  const crest = WAVE_X.map((x, i) => `${x}% ${baseline + WAVE_OFFSET[i]}%`)
    .reverse()
    .join(', ');
  return `polygon(-10% -50%, 110% -50%, ${crest})`;
}

const EMPTY_CLIP = waveClipPath(-8);
const FULL_CLIP = waveClipPath(108);

type EnterRoomFn = (href: string) => void;
type ExitRoomFn = (href: string, lines?: string[]) => void;
type RevealCurrentFn = () => void;

const RoomTransitionContext = createContext<{
  enterRoom: EnterRoomFn;
  exitRoom: ExitRoomFn;
  revealCurrent: RevealCurrentFn;
} | null>(null);

export function useRoomTransition() {
  const ctx = useContext(RoomTransitionContext);
  if (!ctx) throw new Error('useRoomTransition must be used within RoomTransitionProvider');
  return ctx;
}

export function RoomTransitionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<WavePhase>('idle');
  const [variant, setVariant] = useState<Variant>('enter');
  const [exitLines, setExitLines] = useState<string[]>(EXIT_LINES_DEFAULT);
  const [isNavPending, startNavigation] = useTransition();
  const [bgFailed, setBgFailed] = useState(false);
  const router = useRouter();

  const phaseRef = useRef<WavePhase>('idle');
  const navStartedRef = useRef(false);
  const risenRef = useRef(false);
  const navDoneRef = useRef(false);
  const recedeScheduledRef = useRef(false);
  const coveredAtRef = useRef(0);

  const setPhaseSync = useCallback((p: WavePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const tryRecede = useCallback(() => {
    if (!risenRef.current || !navDoneRef.current || recedeScheduledRef.current) return;
    recedeScheduledRef.current = true;
    const wait = Math.max(0, MIN_COVERED_MS - (Date.now() - coveredAtRef.current));
    setTimeout(() => setPhaseSync('receding'), wait);
  }, [setPhaseSync]);

  // Flips once the client-side navigation started inside startNavigation
  // has actually committed the new route (isNavPending goes true -> false).
  useEffect(() => {
    if (navStartedRef.current && !isNavPending) {
      navDoneRef.current = true;
      tryRecede();
    }
  }, [isNavPending, tryRecede]);

  // navigate: omitted for a "welcome" flourish over content that's already
  // mounted (nothing to route to); provided for a real cross-page transition,
  // in which case receding waits for that navigation to actually commit.
  const go = useCallback((nextVariant: Variant, opts: { lines?: string[]; navigate?: () => void }) => {
    navStartedRef.current = true;
    risenRef.current = false;
    navDoneRef.current = !opts.navigate;
    recedeScheduledRef.current = false;
    setBgFailed(false);
    setVariant(nextVariant);
    if (nextVariant === 'exit') setExitLines(opts.lines?.length ? opts.lines : EXIT_LINES_DEFAULT);
    setPhaseSync('rising');

    if (opts.navigate) {
      const navigate = opts.navigate;
      startNavigation(() => {
        navigate();
      });
    }
  }, [setPhaseSync]);

  const enterRoom = useCallback<EnterRoomFn>(
    (href) => go('enter', { navigate: () => router.push(href) }),
    [go, router]
  );
  const exitRoom = useCallback<ExitRoomFn>(
    (href, lines) => {
      // Leaving as host deletes the room row, which echoes back through the
      // room's own realtime subscription as a DELETE event that also calls
      // exitRoom. Without this guard the second call resets risenRef/
      // navDoneRef mid-animation while the wave's target clipPath hasn't
      // actually changed, so onAnimationComplete never re-fires and the
      // transition gets stuck covered forever. Ignore the re-entrant call.
      if (phaseRef.current !== 'idle') return;
      go('exit', { lines, navigate: () => router.push(href) });
    },
    [go, router]
  );
  // For a room reached without going through enterRoom (a fresh/cold load
  // of a shared invite link, or any navigation we don't control) — plays
  // the same wave over the room that's already mounted underneath, purely
  // as a welcome flourish. No-ops if a real transition is already in
  // progress so it never double-fires on top of enterRoom.
  const revealCurrent = useCallback<RevealCurrentFn>(() => {
    if (phaseRef.current !== 'idle') return;
    go('enter', {});
  }, [go]);

  const covered = phase === 'covered' || phase === 'receding';
  const active = phase !== 'idle';
  const isExit = variant === 'exit';
  const lines = isExit ? exitLines : ['THE SHORE'];
  const bgSrc = isExit ? EXIT_BG_SRC : ENTER_BG_SRC;

  return (
    <RoomTransitionContext.Provider value={{ enterRoom, exitRoom, revealCurrent }}>
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[300] flex items-center justify-center overflow-hidden bg-ink"
        initial={false}
        animate={{
          clipPath:
            phase === 'idle'
              ? 'inset(100% 0 0 0)'
              : phase === 'rising' || phase === 'covered'
                ? 'inset(0% 0 0 0)'
                : 'inset(0 0 100% 0)',
        }}
        transition={{ duration: (phase === 'rising' ? RISE_MS : RECEDE_MS) / 1000, ease: EASE }}
        onAnimationComplete={() => {
          if (phase === 'rising') {
            risenRef.current = true;
            coveredAtRef.current = Date.now();
            setPhaseSync('covered');
            tryRecede();
          } else if (phase === 'receding') {
            setPhaseSync('idle');
          }
        }}
      >
        {/* Ambient background image, dimmed under the wordmark. Falls back to
            the gradient below if it ever fails to load. */}
        {!bgFailed && active ? (
          // eslint-disable-next-line @next/next/no-img-element -- unoptimized by design (gif motion / one-off still)
          <img
            key={bgSrc}
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            src={bgSrc}
            alt=""
            onError={() => setBgFailed(true)}
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(140% 100% at 30% 20%, var(--color-coral-deep) 0%, transparent 55%), radial-gradient(120% 90% at 80% 90%, var(--color-teal-deep) 0%, transparent 60%), var(--color-ink)',
            opacity: bgFailed || !active ? 1 : 0.55,
          }}
        />
        <div className="absolute inset-0 bg-ink/35" />

        <div className="relative select-none px-6 text-center flex flex-col items-center">
          {/* Dim base wordmark — the "unloaded" state, always faintly visible */}
          <div className={isExit ? 'flex flex-col gap-1' : undefined}>
            {lines.map((line, i) => (
              <span
                key={i}
                className={`font-pixel tracking-[0.05em] text-cream/10 whitespace-nowrap block ${
                  isExit ? 'text-4xl sm:text-5xl md:text-6xl' : 'text-6xl sm:text-7xl md:text-8xl'
                }`}
              >
                {line}
              </span>
            ))}
          </div>

          {/* Bright wordmark, revealed top-to-bottom behind a wavy edge */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={false}
            animate={{ clipPath: covered ? FULL_CLIP : EMPTY_CLIP }}
            transition={{ duration: FILL_MS / 1000, ease: EASE, delay: covered ? 0.08 : 0 }}
          >
            <div className={isExit ? 'flex flex-col gap-1' : undefined}>
              {lines.map((line, i) => (
                <span
                  key={i}
                  className={`font-pixel tracking-[0.05em] text-cream whitespace-nowrap block ${
                    isExit ? 'text-4xl sm:text-5xl md:text-6xl' : 'text-6xl sm:text-7xl md:text-8xl'
                  }`}
                >
                  {line}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </RoomTransitionContext.Provider>
  );
}

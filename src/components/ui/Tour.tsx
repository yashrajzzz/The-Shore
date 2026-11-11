'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Portal } from './Portal';

export type TourStep = {
  /** Value of a `data-tour="..."` attribute. Omit for a centred message card. */
  target?: string;
  title: string;
  body: string;
  /**
   * 'left' puts the card beside the target on wide screens instead of below it,
   * so it never covers what it is describing (used for the side panel).
   */
  placement?: 'auto' | 'left';
  /** Runs when the step becomes active (e.g. open the sidebar on a tab). */
  onEnter?: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6;
const GAP = 12;
const MARGIN = 12;

function findTarget(name: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  // Prefer a node that is actually laid out (e.g. skip a hidden mobile twin).
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return n;
  }
  return null;
}

/**
 * Spotlight walkthrough. Mount it only while the tour should run; it calls
 * `onDone` when the user finishes, skips, or presses Escape.
 */
export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Run the step's side effect (open a tab, etc.) once per step.
  useEffect(() => {
    stepsRef.current[index]?.onEnter?.();
    nextRef.current?.focus({ preventScroll: true });
  }, [index]);

  // Track the target's position. Polling keeps it correct while panels slide
  // in, the window resizes, or content loads, and costs almost nothing.
  useEffect(() => {
    const measure = () => {
      const name = stepsRef.current[index]?.target;
      const el = name ? findTarget(name) : null;
      if (!el) {
        setRect(prev => (prev === null ? prev : null));
        return;
      }
      // Deliberately no scrollIntoView: the side panel slides in from off-screen,
      // and scrolling to a target inside it shoves the whole page sideways.
      const r = el.getBoundingClientRect();
      setRect(prev =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height }
      );
    };
    measure();
    const id = window.setInterval(measure, 120);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [index]);

  // Place the card next to the spotlight, always fully on screen.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    if (!rect) {
      setCardPos({ top: Math.max(MARGIN, (vh - ch) / 2), left: Math.max(MARGIN, (vw - cw) / 2) });
      return;
    }
    if (steps[index]?.placement === 'left' && vw >= 640) {
      const leftPos = rect.left - PAD - GAP - cw;
      if (leftPos >= MARGIN) {
        const top = Math.min(Math.max(MARGIN, rect.top), Math.max(MARGIN, vh - ch - MARGIN));
        setCardPos(prev => (prev && prev.top === top && prev.left === leftPos ? prev : { top, left: leftPos }));
        return;
      }
    }
    const spaceBelow = vh - (rect.top + rect.height + PAD) - GAP;
    const spaceAbove = rect.top - PAD - GAP;
    let top: number;
    if (spaceBelow >= ch + MARGIN) top = rect.top + rect.height + PAD + GAP;
    else if (spaceAbove >= ch + MARGIN) top = rect.top - PAD - GAP - ch;
    else top = Math.max(MARGIN, vh - ch - MARGIN); // no room beside it: dock at the bottom
    const centre = rect.left + rect.width / 2;
    const left = Math.min(Math.max(MARGIN, centre - cw / 2), Math.max(MARGIN, vw - cw - MARGIN));
    setCardPos(prev => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [rect, index, steps]);

  const next = useCallback(() => {
    if (isLast) onDone();
    else setIndex(i => i + 1);
  }, [isLast, onDone]);

  const back = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onDone]);

  if (!step) return null;

  return (
    <Portal className="fixed inset-0 z-[400]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Full-screen layer: blocks clicks on the page underneath while touring. */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl border-[2.5px] border-ink transition-all duration-200 ease-out"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(33, 29, 23, 0.6)',
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-ink/60" />
      )}

      <div
        ref={cardRef}
        className="fixed w-[min(340px,calc(100vw-24px))] rounded-2xl border-[2.5px] border-ink bg-paper p-4 shadow-[5px_5px_0_var(--color-ink)]"
        style={{
          top: cardPos?.top ?? 0,
          left: cardPos?.left ?? 0,
          visibility: cardPos ? 'visible' : 'hidden',
          transition: 'top 200ms ease-out, left 200ms ease-out',
        }}
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
          step {index + 1} of {steps.length}
        </p>
        <h3 className="mt-1 font-pixel text-[26px] leading-none text-ink">{step.title}</h3>
        <p className="mt-2 font-mono text-[12px] leading-relaxed text-ink-soft">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onDone}
            className="font-mono text-[11px] text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            skip tour
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-full border-2 border-ink bg-paper px-3 py-1.5 font-mono text-[11px] font-bold shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)]"
              >
                back
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              onClick={next}
              className="rounded-full border-2 border-ink bg-coral px-4 py-1.5 font-mono text-[11px] font-bold shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)]"
            >
              {isLast ? 'got it' : 'next'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

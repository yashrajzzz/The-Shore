'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gamepad2, X } from 'lucide-react';

import { NinjaClimb } from './NinjaClimb';

// Shore Runner: a tiny endless runner (think Chrome's dino). A pixel cat jumps
// obstacles through changing environments, a day/night cycle and gusts of
// wind. Pure canvas, no audio, stops when closed — the music keeps playing.

const W = 600;
const H = 200;
const GROUND = 160;
const GRAVITY = 2600;
const JUMP_V = -780;
const START_SPEED = 260;
const MAX_SPEED = 640;
const PX = 3;
const RESTART_DELAY = 700; // ignore taps right after dying so game over is seen
const BIOME_LEN = 2800; // score points per environment (roughly a minute or more)
const DAY_LEN = 9000; // score points per full day/night cycle (a few minutes)
const HI_KEY = 'shore_runner_hi';

const CAT_A = [
  '.......#.#',
  '.......###',
  '.......#e#',
  '.#.#######',
  '##.#######',
  '..########',
  '..#######.',
  '..##..##..',
  '..##..##..',
];
const CAT_B = [
  '.......#.#',
  '.......###',
  '.......#e#',
  '.#.#######',
  '##.#######',
  '..########',
  '..#######.',
  '...##..##.',
  '...##..##.',
];
const CAT_W = CAT_A[0].length * PX;
const CAT_H = CAT_A.length * PX;
const CAT_X = 48;

type Biome = { name: string; ground: string; far: string; roller: string };
const BIOMES: Biome[] = [
  { name: 'shore', ground: '#ecdcae', far: '#8fd1c4', roller: '#ff8f7a' },
  { name: 'forest', ground: '#86b26e', far: '#4f8a5b', roller: '#9a6a3c' },
  { name: 'desert', ground: '#ebcd8f', far: '#dcae66', roller: '#b98a4a' },
  { name: 'snow', ground: '#f4f7fb', far: '#b9c9de', roller: '#ffffff' },
];

type Obstacle = {
  kind: 'block' | 'bird' | 'roller';
  x: number;
  w: number;
  h: number;
  y: number; // top edge
  m: number; // speed multiplier (relative to the world)
  skin: number; // biome index at spawn
};
type Phase = 'idle' | 'running' | 'over';

const hex = /^#[0-9a-f]{6}$/i;
const parse = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function lerpColor(a: string, b: string, t: number) {
  if (!hex.test(a) || !hex.test(b)) return a;
  const pa = parse(a);
  const pb = parse(b);
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}
function interp(keys: [number, number][], p: number) {
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [p0, v0] = keys[i - 1];
      const [p1, v1] = keys[i];
      return v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
    }
  }
  return keys[keys.length - 1][1];
}
function skyAt(p: number) {
  const stops: [number, string][] = [
    [0, '#cfeef2'], [0.35, '#cfeef2'], [0.47, '#f2b79a'], [0.6, '#1b2340'], [0.85, '#1b2340'], [0.95, '#f2b79a'], [1, '#cfeef2'],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      const t = (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return lerpColor(stops[i - 1][1], stops[i][1], t);
    }
  }
  return stops[stops.length - 1][1];
}
const NIGHT_KEYS: [number, number][] = [[0, 0], [0.35, 0], [0.55, 1], [0.88, 1], [1, 0]];

function readHi() {
  try {
    return Number(localStorage.getItem(HI_KEY)) || 0;
  } catch {
    return 0;
  }
}

function RunnerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [hi, setHi] = useState(readHi);
  const [canRetry, setCanRetry] = useState(true);
  const [newHi, setNewHi] = useState(false);
  const hiRef = useRef(hi);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const g = useRef({
    phase: 'idle' as Phase,
    overAt: 0,
    y: GROUND - CAT_H,
    vy: 0,
    onGround: true,
    obstacles: [] as Obstacle[],
    speed: START_SPEED,
    dist: 0,
    nextGap: 500,
    groundOffset: 0,
    frame: 0,
    score: 0,
    windLeft: 0,
    nextWind: 50,
  });

  const jump = useCallback(() => {
    const s = g.current;
    if (s.phase === 'idle' || s.phase === 'over') {
      // Swallow the tap/keypress that was still going when you died, so the
      // game-over screen actually shows instead of restarting immediately.
      if (s.phase === 'over' && performance.now() - s.overAt < RESTART_DELAY) return;
      Object.assign(s, {
        phase: 'running' as Phase,
        y: GROUND - CAT_H,
        vy: 0,
        onGround: true,
        obstacles: [],
        speed: START_SPEED,
        dist: 0,
        nextGap: 500,
        score: 0,
        windLeft: 0,
        nextWind: 50,
      });
      setScore(0);
      setNewHi(false);
      setCanRetry(true);
      setPhase('running');
      return;
    }
    if (s.onGround) {
      s.vy = JUMP_V;
      s.onGround = false;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (!e.repeat) jump();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump]);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    const INK = '#2b2118';
    const CREAM = '#f7eed8';
    const stars = Array.from({ length: 28 }, (_, i) => ({
      x: (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * W,
      y: (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1 * (GROUND - 30),
    }));
    const wind = Array.from({ length: 16 }, (_, i) => ({
      x: (i * 97) % W,
      y: 20 + ((i * 53) % (GROUND - 30)),
      l: 18 + (i % 4) * 10,
      s: 0.6 + (i % 5) * 0.2,
    }));

    const drawCat = (x: number, y: number, frame: number, fg: string, eye: string) => {
      const sprite = frame ? CAT_B : CAT_A;
      sprite.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          const ch = row[c];
          if (ch === '.') continue;
          ctx.fillStyle = ch === 'e' ? eye : fg;
          ctx.fillRect(x + c * PX, y + r * PX, PX, PX);
        }
      });
    };

    const drawBlock = (o: Obstacle, fg: string) => {
      const y = GROUND - o.h;
      switch (o.skin) {
        case 0: // crate
          ctx.fillStyle = '#f0a58f';
          ctx.fillRect(o.x, y, o.w, o.h);
          ctx.strokeStyle = fg;
          ctx.lineWidth = 3;
          ctx.strokeRect(o.x + 1.5, y + 1.5, o.w - 3, o.h - 3);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(o.x + 4, y + 4);
          ctx.lineTo(o.x + o.w - 4, y + o.h - 4);
          ctx.stroke();
          break;
        case 1: // stump
          ctx.fillStyle = '#8a5a35';
          ctx.fillRect(o.x, y, o.w, o.h);
          ctx.fillStyle = '#c89868';
          ctx.fillRect(o.x, y, o.w, 5);
          ctx.strokeStyle = fg;
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x + 1, y + 1, o.w - 2, o.h - 2);
          break;
        case 2: { // cactus
          const bw = Math.min(o.w, 14);
          const bx = o.x + (o.w - bw) / 2;
          ctx.fillStyle = '#4f9a4a';
          ctx.fillRect(bx, y, bw, o.h);
          if (o.h > 30) {
            ctx.fillRect(bx - 8, y + 12, 8, 5);
            ctx.fillRect(bx - 8, y + 6, 5, 11);
            ctx.fillRect(bx + bw, y + 18, 8, 5);
            ctx.fillRect(bx + bw + 3, y + 10, 5, 13);
          }
          ctx.strokeStyle = fg;
          ctx.lineWidth = 2;
          ctx.strokeRect(bx + 1, y + 1, bw - 2, o.h - 2);
          break;
        }
        default: // ice block
          ctx.fillStyle = '#bfe6f7';
          ctx.fillRect(o.x, y, o.w, o.h);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(o.x + 3, y + 3, 5, o.h - 8);
          ctx.strokeStyle = fg;
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x + 1, y + 1, o.w - 2, o.h - 2);
      }
    };

    const drawRoller = (o: Obstacle, dist: number, fg: string) => {
      const cx = o.x + 12;
      const cy = GROUND - 12;
      ctx.fillStyle = BIOMES[o.skin].roller;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      ctx.stroke();
      const a = dist / 14;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
      ctx.lineTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12);
      ctx.moveTo(cx + Math.cos(a + 1.57) * 12, cy + Math.sin(a + 1.57) * 12);
      ctx.lineTo(cx - Math.cos(a + 1.57) * 12, cy - Math.sin(a + 1.57) * 12);
      ctx.stroke();
    };

    const drawBird = (o: Obstacle, t: number, fg: string) => {
      ctx.fillStyle = '#f2efe6';
      ctx.fillRect(o.x + 6, o.y + 6, 18, 8);
      ctx.fillRect(o.x + 2, o.y + 4, 8, 7);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(o.x - 3, o.y + 7, 5, 3);
      ctx.fillStyle = fg;
      ctx.fillRect(o.x + 5, o.y + 6, 2, 2);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      const up = Math.floor(t * 9) % 2 ? -9 : 6;
      ctx.beginPath();
      ctx.moveTo(o.x + 10, o.y + 7);
      ctx.lineTo(o.x + 16, o.y + 7 + up);
      ctx.lineTo(o.x + 22, o.y + 7);
      ctx.stroke();
    };

    const drawFar = (biome: number, offset: number, color: string) => {
      ctx.fillStyle = color;
      if (biome === 0) {
        for (let i = 0; i < 6; i++) {
          const x = ((i * 120 - offset) % (W + 100) + (W + 100)) % (W + 100) - 50;
          ctx.fillRect(x, 70 + (i % 2) * 24, 60, 4);
          ctx.fillRect(x + 14, 78 + (i % 2) * 24, 34, 3);
        }
      } else if (biome === 1) {
        for (let i = 0; i < 12; i++) {
          const x = ((i * 70 - offset) % (W + 100) + (W + 100)) % (W + 100) - 50;
          const h = 44 + (i % 3) * 12;
          ctx.beginPath();
          ctx.moveTo(x - 20, GROUND);
          ctx.lineTo(x, GROUND - h);
          ctx.lineTo(x + 20, GROUND);
          ctx.fill();
        }
      } else if (biome === 2) {
        ctx.beginPath();
        ctx.moveTo(0, GROUND);
        for (let x = 0; x <= W; x += 10) {
          ctx.lineTo(x, GROUND - 26 - 18 * Math.sin((x + offset) / 80) - 8 * Math.sin((x + offset) / 31));
        }
        ctx.lineTo(W, GROUND);
        ctx.fill();
      } else {
        for (let i = 0; i < 6; i++) {
          const x = ((i * 150 - offset) % (W + 200) + (W + 200)) % (W + 200) - 100;
          const h = 64 + (i % 3) * 14;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(x - 60, GROUND);
          ctx.lineTo(x, GROUND - h);
          ctx.lineTo(x + 60, GROUND);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(x - 14, GROUND - h + 18);
          ctx.lineTo(x, GROUND - h);
          ctx.lineTo(x + 14, GROUND - h + 18);
          ctx.fill();
        }
      }
    };

    const boxOf = (o: Obstacle): [number, number, number, number] => {
      if (o.kind === 'block') return [o.x + 3, GROUND - o.h + 3, o.x + o.w - 3, GROUND];
      if (o.kind === 'roller') return [o.x + 4, GROUND - 20, o.x + 20, GROUND];
      return [o.x + 3, o.y + 4, o.x + 24, o.y + 14];
    };

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let lastShownScore = 0;

    const spawn = (s: typeof g.current) => {
      const sc = s.score;
      const biome = Math.floor(sc / BIOME_LEN) % BIOMES.length;
      const r = Math.random();
      const fastExtra = 1.3;
      if (sc > 300 && r < 0.18) {
        s.obstacles.push({ kind: 'roller', x: W + 10, w: 24, h: 24, y: GROUND - 24, m: 1.35, skin: biome });
        s.nextGap = (s.speed * (0.75 + Math.random() * 0.7) + 120) * fastExtra;
      } else if (sc > 180 && r < 0.38) {
        const high = Math.random() < 0.5;
        s.obstacles.push({ kind: 'bird', x: W + 10, w: 28, h: 18, y: high ? GROUND - 70 : GROUND - 28, m: 1.15, skin: biome });
        s.nextGap = (s.speed * (0.75 + Math.random() * 0.7) + 120) * fastExtra;
      } else {
        const tall = Math.random() < 0.3;
        const count = Math.random() < 0.25 ? 2 : 1;
        let x = W + 10;
        for (let i = 0; i < count; i++) {
          const w = 18 + Math.floor(Math.random() * (tall ? 10 : 18));
          const h = tall ? 40 + Math.floor(Math.random() * 10) : 22 + Math.floor(Math.random() * 12);
          s.obstacles.push({ kind: 'block', x, w, h, y: GROUND - h, m: 1, skin: biome });
          x += w + 4;
        }
        s.nextGap = s.speed * (0.75 + Math.random() * 0.7) + 120;
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      const s = g.current;

      // Phase of the day/night cycle and current environment (driven by score).
      const dayP = (s.score % DAY_LEN) / DAY_LEN;
      const night = interp(NIGHT_KEYS, dayP);
      const biomeIdx = Math.floor(s.score / BIOME_LEN) % BIOMES.length;
      const biome = BIOMES[biomeIdx];

      if (s.phase === 'running') {
        s.speed = Math.min(MAX_SPEED, s.speed + dt * 6);
        s.dist += s.speed * dt;
        s.score = Math.floor(s.dist / 10);
        s.groundOffset = (s.groundOffset + s.speed * dt) % 40;
        s.frame = Math.floor(s.dist / 24) % 2;

        // Wind gusts: floatier jumps while it blows.
        if (s.windLeft > 0) s.windLeft -= dt;
        else {
          s.nextWind -= dt;
          if (s.nextWind <= 0) {
            s.windLeft = 6 + Math.random() * 3;
            s.nextWind = 60 + Math.random() * 40;
          }
        }
        const windy = s.windLeft > 0;

        s.vy += GRAVITY * (windy ? 0.82 : 1) * dt;
        s.y += s.vy * dt;
        if (s.y >= GROUND - CAT_H) {
          s.y = GROUND - CAT_H;
          s.vy = 0;
          s.onGround = true;
        }

        for (const o of s.obstacles) o.x -= s.speed * o.m * dt;
        s.obstacles = s.obstacles.filter((o) => o.x + o.w > -20);

        const lastO = s.obstacles[s.obstacles.length - 1];
        if (!lastO || W - (lastO.x + lastO.w) > s.nextGap) spawn(s);

        const cx1 = CAT_X + 5;
        const cx2 = CAT_X + CAT_W - 5;
        const cy1 = s.y + 4;
        const cy2 = s.y + CAT_H - 2;
        for (const o of s.obstacles) {
          const [x1, y1, x2, y2] = boxOf(o);
          if (cx2 > x1 && cx1 < x2 && cy2 > y1 && cy1 < y2) {
            s.phase = 'over';
            s.overAt = performance.now();
            setPhase('over');
            setCanRetry(false);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => setCanRetry(true), RESTART_DELAY);
            if (s.score > hiRef.current) {
              hiRef.current = s.score;
              setHi(s.score);
              setNewHi(true);
              try { localStorage.setItem(HI_KEY, String(s.score)); } catch { /* ignore */ }
            }
            break;
          }
        }

        if (s.score !== lastShownScore) {
          lastShownScore = s.score;
          setScore(s.score);
        }
      }

      const windy = s.windLeft > 0 && s.phase === 'running';

      // ---- draw ----
      const fg = lerpColor(INK, CREAM, night);
      const eye = lerpColor('#fffaf0', INK, night);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = skyAt(dayP);
      ctx.fillRect(0, 0, W, H);

      // stars, sun / moon
      if (night > 0.05) {
        ctx.fillStyle = '#ffffff';
        for (const st of stars) {
          ctx.globalAlpha = night * (0.5 + 0.5 * Math.sin(elapsed * 2 + st.x));
          ctx.fillRect(st.x, st.y, 2, 2);
        }
        ctx.globalAlpha = night;
        ctx.fillStyle = '#f5ecd6';
        ctx.beginPath();
        ctx.arc(520, 40, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = skyAt(dayP);
        ctx.beginPath();
        ctx.arc(526, 36, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (night < 0.95) {
        ctx.globalAlpha = 1 - night;
        ctx.fillStyle = '#ffd36b';
        ctx.beginPath();
        ctx.arc(90, 42, 14, 0, Math.PI * 2);
        ctx.fill();
        // clouds
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 3; i++) {
          const cx = ((i * 230 - s.dist * 0.08) % (W + 120) + (W + 120)) % (W + 120) - 60;
          ctx.fillRect(cx, 30 + i * 14, 50, 9);
          ctx.fillRect(cx + 10, 24 + i * 14, 28, 8);
        }
        ctx.globalAlpha = 1;
      }

      drawFar(biomeIdx, s.dist * 0.2, lerpColor(biome.far, '#101830', night * 0.6));

      ctx.fillStyle = lerpColor(biome.ground, '#2a2f45', night * 0.6);
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = fg;
      ctx.fillRect(0, GROUND, W, 3);
      for (let x = -s.groundOffset; x < W; x += 40) {
        ctx.fillRect(x + 8, GROUND + 12, 14, 3);
        ctx.fillRect(x + 28, GROUND + 24, 6, 3);
      }

      for (const o of s.obstacles) {
        if (o.kind === 'block') drawBlock(o, fg);
        else if (o.kind === 'roller') drawRoller(o, s.dist, fg);
        else drawBird(o, elapsed, fg);
      }
      drawCat(CAT_X, s.y, s.onGround && s.phase === 'running' ? s.frame : 0, fg, eye);

      // wind streaks
      if (windy) {
        ctx.strokeStyle = fg;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 2;
        for (const p of wind) {
          p.x -= (s.speed * 0.9 + 380 * p.s) * dt;
          if (p.x + p.l < 0) p.x = W + Math.random() * 60;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.l, p.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between font-pixel text-lg leading-none text-ink">
        <span>HI {String(hi).padStart(5, '0')}</span>
        <span>{String(score).padStart(5, '0')}</span>
      </div>

      <div className="relative overflow-hidden rounded-xl border-[2.5px] border-ink shadow-[3px_3px_0_var(--color-ink)]">
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => { e.preventDefault(); jump(); }}
          className="block w-full cursor-pointer touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Shore runner game. Press space or tap to jump."
        />
        {phase !== 'running' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink/15 text-center">
            <p className="font-pixel text-2xl text-ink sm:text-3xl">{phase === 'over' ? 'game over' : 'shore runner'}</p>
            {phase === 'over' && (
              <p className="font-mono text-[11px] font-bold text-ink">
                {score}{newHi ? ' · new best!' : ''}
              </p>
            )}
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink/70 sm:text-xs">
              {phase === 'over' ? (canRetry ? 'tap or press space to retry' : '…') : 'tap or press space to start'}
            </p>
          </div>
        )}
      </div>

      <p className="text-center font-mono text-[10px] text-ink-soft">
        space / ↑ / tap to jump · birds, rollers &amp; wind get trickier · music keeps playing
      </p>
    </div>
  );
}

type Game = 'runner' | 'ninja';

export function ShoreRunnerButton() {
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState<Game>('runner');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const tab = (id: Game, label: string) => (
    <button
      type="button"
      onClick={() => setGame(id)}
      aria-pressed={game === id}
      className={`flex-1 rounded-lg border-2 border-ink px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors sm:py-1.5 ${
        game === id ? 'bg-coral shadow-[2px_2px_0_var(--color-ink)]' : 'bg-paper hover:bg-teal-1'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Play a game"
        title="Play a game"
        className="w-11 h-11 sm:w-12 sm:h-12 bg-teal-2/90 backdrop-blur-md border-[2.5px] border-ink rounded-xl shadow-[3px_3px_0_var(--color-ink)] sm:shadow-[4px_4px_0_var(--color-ink)] flex items-center justify-center hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)] transition-all z-[60]"
      >
        <Gamepad2 size={20} strokeWidth={2.25} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/30 p-2 backdrop-blur-[2px] sm:items-center sm:p-4 pointer-events-auto"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-h-[96dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border-[3px] border-ink bg-paper pb-[env(safe-area-inset-bottom)] shadow-[8px_8px_0_var(--color-ink)]"
            >
              <div className="flex items-center justify-between border-b-2 border-ink bg-cream px-4 py-3 sm:px-5">
                <h2 className="font-pixel text-lg text-ink">Take a break</h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close game"
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-coral sm:h-8 sm:w-8"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex flex-col gap-3 p-3 sm:p-5">
                <div className="flex gap-2">
                  {tab('runner', 'Shore Runner')}
                  {tab('ninja', 'Ninja Climb')}
                </div>
                {game === 'runner' ? <RunnerGame key="runner" /> : <NinjaClimb key="ninja" />}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

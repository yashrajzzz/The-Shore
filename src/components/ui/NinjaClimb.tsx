'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Ninja Climb: two buildings, a ninja running up between them. Tap to leap to
// the opposite wall. Dodge squirrels, spikes, swooping birds and flowerpots.

const W = 360;
const H = 560;
const WALL = 56;
const NW = 22;
const NH = 30;
const NY = 410;
const JUMP_T = 0.3;
const RESTART_DELAY = 700;
const HI_KEY = 'shore_ninja_hi';

type Phase = 'idle' | 'running' | 'over';
type Side = -1 | 1;
type Obstacle =
  | { kind: 'squirrel'; side: Side; y: number }
  | { kind: 'spikes'; side: Side; y: number }
  | { kind: 'bird'; x: number; y: number; vx: number }
  | { kind: 'pot'; side: Side; y: number; warn: number; vy: number };

type Kind = Obstacle['kind'];
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const SLASH_TIME = 0.24;
const SLASH_CD = 0.4;
const SLICE_BUFFER = 0.1; // a slice pressed a moment early still fires when ready
const STREAK_WINDOW = 10; // seconds to land the next matching slice
// The slice covers a big area: far ahead (toward the gap) and well above the
// ninja, so things coming down the wall or across the gap get cut in time.
const REACH_X = 90;
const REACH_UP = 75;
const REACH_DOWN = 28;
const REACH_PAD = 4; // extra forgiveness around each obstacle
const KIND_COLOR: Record<Kind, string> = { squirrel: '#b5703a', spikes: '#c9ccd6', bird: '#f2efe6', pot: '#c9683b' };
// Slice 3 of the same thing in a row to get that thing's power.
const POWERS: Record<Kind, { name: string; color: string; dur: number }> = {
  squirrel: { name: 'NUT RUSH', color: '#ffb347', dur: 5 }, // super speed, nothing can hurt you
  bird: { name: 'EAGLE EYE', color: '#8fd1ff', dur: 6 }, // the world slows down
  pot: { name: 'CLAY SHIELD', color: '#e07b4a', dur: 12 }, // absorbs the next 2 hits
  spikes: { name: 'IRON SKIN', color: '#d5d8e2', dur: 6 }, // invincible, smash through
};

const xFor = (side: Side) => (side < 0 ? WALL : W - WALL - NW);

function readHi() {
  try {
    return Number(localStorage.getItem(HI_KEY)) || 0;
  } catch {
    return 0;
  }
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function NinjaClimb() {
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
    side: -1 as Side,
    jump: null as null | { t: number; from: Side; to: Side },
    queued: null as Side | null,
    obstacles: [] as Obstacle[],
    dist: 0,
    speed: 210,
    spawnAcc: 0,
    nextSpawn: 300,
    score: 0,
    frame: 0,
    slash: 0,
    slashCd: 0,
    slashDir: 1 as 1 | -1,
    wantSlice: false,
    sliceBuf: 0,
    streakKind: null as Kind | null,
    streak: 0,
    streakT: 0,
    power: null as null | { kind: Kind; left: number },
    shield: 0,
    bonus: 0,
    particles: [] as Particle[],
  });

  const startJump = (s: typeof g.current, to: Side) => {
    s.jump = { t: 0, from: s.side, to };
  };

  const requestSide = useCallback((target: Side | 'toggle') => {
    const s = g.current;
    if (s.phase === 'idle' || s.phase === 'over') {
      // Ignore the tap/keypress that happens while you're dying, so the
      // game-over screen actually gets seen instead of restarting at once.
      if (s.phase === 'over' && performance.now() - s.overAt < RESTART_DELAY) return;
      Object.assign(s, {
        phase: 'running' as Phase,
        side: -1 as Side,
        jump: null,
        queued: null,
        obstacles: [],
        dist: 0,
        speed: 210,
        spawnAcc: 0,
        nextSpawn: 300,
        score: 0,
        slash: 0,
        slashCd: 0,
        wantSlice: false,
        sliceBuf: 0,
        streakKind: null,
        streak: 0,
        streakT: 0,
        power: null,
        shield: 0,
        bonus: 0,
        particles: [],
      });
      setScore(0);
      setNewHi(false);
      setCanRetry(true);
      setPhase('running');
      return;
    }
    const to: Side = target === 'toggle' ? ((s.jump ? -s.jump.to : -s.side) as Side) : target;
    if (s.jump) {
      s.queued = to; // buffer one input so quick taps still register
      return;
    }
    if (to !== s.side) startJump(s, to);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        requestSide('toggle');
      } else if (['KeyX', 'KeyZ', 'KeyS', 'ArrowDown', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
        g.current.wantSlice = true;
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        requestSide(-1);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        requestSide(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestSide]);

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

    const stars = Array.from({ length: 40 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 99) * H, r: hash(i + 7) * 1.4 + 0.4 }));

    const boxOf = (o: Obstacle): [number, number, number, number] => {
      switch (o.kind) {
        case 'squirrel': {
          const x = o.side < 0 ? WALL : W - WALL - 22;
          return [x + 2, o.y + 2, x + 20, o.y + 18];
        }
        case 'spikes': {
          const x = o.side < 0 ? WALL : W - WALL - 16;
          return [x, o.y + 2, x + 16, o.y + 36];
        }
        case 'bird':
          return [o.x + 3, o.y + 3, o.x + 24, o.y + 12];
        case 'pot': {
          const x = o.side < 0 ? WALL + 4 : W - WALL - 18;
          return [x, o.y + 1, x + 14, o.y + 18];
        }
      }
    };

    const drawNinja = (x: number, y: number, face: Side, frame: number, spin: number) => {
      ctx.save();
      ctx.translate(x + NW / 2, y + NH / 2);
      if (spin) ctx.rotate(spin);
      ctx.translate(-NW / 2, -NH / 2);
      const body = '#0d0f1a';
      ctx.strokeStyle = '#d8d2c2';
      ctx.lineWidth = 1;
      // scarf trailing down (we're running up)
      ctx.fillStyle = '#ff7a6b';
      const sx = face < 0 ? NW - 2 : -6;
      ctx.fillRect(sx, 8 + (frame ? 1 : 0), 8, 3);
      ctx.fillRect(sx + (face < 0 ? 2 : 0), 12, 6, 3);
      // legs
      ctx.fillStyle = body;
      const l1 = frame ? 0 : 3;
      ctx.fillRect(4, 22 + l1, 5, 8 - l1);
      ctx.fillRect(13, 22 + (3 - l1), 5, 8 - (3 - l1));
      // body + head
      ctx.fillRect(3, 11, 16, 13);
      ctx.strokeRect(3.5, 11.5, 15, 12);
      ctx.beginPath();
      ctx.arc(NW / 2, 7, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // headband + eyes (toward the gap)
      ctx.fillStyle = '#ff7a6b';
      ctx.fillRect(4, 4, 14, 3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(face < 0 ? 12 : 6, 8, 4, 2);
      ctx.restore();
    };

    const drawSquirrel = (o: Extract<Obstacle, { kind: 'squirrel' }>) => {
      const x = o.side < 0 ? WALL : W - WALL - 22;
      ctx.fillStyle = '#b5703a';
      ctx.fillRect(x + (o.side < 0 ? 0 : 6), o.y + 6, 16, 11); // body
      ctx.fillRect(x + (o.side < 0 ? 12 : 0), o.y + 1, 9, 9); // head
      ctx.fillStyle = '#e0a56b';
      ctx.fillRect(x + (o.side < 0 ? 17 : 1), o.y + 5, 4, 3); // face
      ctx.fillStyle = '#8f5a2e';
      ctx.fillRect(x + (o.side < 0 ? 0 : 14), o.y - 4, 6, 14); // tail
      ctx.fillStyle = '#0d0f1a';
      ctx.fillRect(x + (o.side < 0 ? 17 : 3), o.y + 3, 2, 2); // eye
    };

    const drawSpikes = (o: Extract<Obstacle, { kind: 'spikes' }>) => {
      ctx.fillStyle = '#c9ccd6';
      for (let i = 0; i < 3; i++) {
        const y = o.y + 2 + i * 12;
        ctx.beginPath();
        if (o.side < 0) {
          ctx.moveTo(WALL, y);
          ctx.lineTo(WALL + 16, y + 6);
          ctx.lineTo(WALL, y + 12);
        } else {
          ctx.moveTo(W - WALL, y);
          ctx.lineTo(W - WALL - 16, y + 6);
          ctx.lineTo(W - WALL, y + 12);
        }
        ctx.closePath();
        ctx.fill();
      }
    };

    const drawBird = (o: Extract<Obstacle, { kind: 'bird' }>, frame: number) => {
      const dir = o.vx >= 0 ? 1 : -1;
      ctx.fillStyle = '#f2efe6';
      ctx.fillRect(o.x + 6, o.y + 4, 14, 7);
      ctx.fillRect(o.x + (dir > 0 ? 18 : 2), o.y + 2, 6, 6);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(o.x + (dir > 0 ? 24 : -2), o.y + 5, 4, 2);
      ctx.fillStyle = '#d8d2c2';
      const up = frame ? -7 : 5;
      ctx.beginPath();
      ctx.moveTo(o.x + 8, o.y + 5);
      ctx.lineTo(o.x + 13, o.y + 5 + up);
      ctx.lineTo(o.x + 18, o.y + 5);
      ctx.fill();
    };

    const drawPot = (o: Extract<Obstacle, { kind: 'pot' }>, tick: number) => {
      const x = o.side < 0 ? WALL + 4 : W - WALL - 18;
      if (o.warn > 0) {
        // little open window + blinking "!" so you can see it coming
        if (Math.floor(tick * 8) % 2 === 0) {
          ctx.fillStyle = '#ff7a6b';
          ctx.fillRect(x + 5, 12, 4, 12);
          ctx.fillRect(x + 5, 28, 4, 4);
        }
        return;
      }
      ctx.fillStyle = '#c9683b';
      ctx.fillRect(x, o.y + 4, 14, 14);
      ctx.fillRect(x - 1, o.y + 2, 16, 4);
      ctx.fillStyle = '#4f9a4a';
      ctx.fillRect(x + 3, o.y - 4, 3, 7);
      ctx.fillRect(x + 8, o.y - 2, 3, 5);
    };

    const burst = (s: typeof g.current, o: Obstacle, color: string) => {
      const [x1, y1, x2, y2] = boxOf(o);
      for (let i = 0; i < 12; i++) {
        s.particles.push({
          x: (x1 + x2) / 2,
          y: (y1 + y2) / 2,
          vx: (Math.random() - 0.5) * 300,
          vy: (Math.random() - 0.5) * 300,
          life: 0.5,
          color,
        });
      }
    };

    // An obstacle got destroyed. `counts` = it was a deliberate slice (feeds the
    // 3-in-a-row streak) rather than smashed by a power.
    const onDestroyed = (s: typeof g.current, o: Obstacle, counts: boolean) => {
      burst(s, o, KIND_COLOR[o.kind]);
      s.bonus += counts ? 5 : 2;
      if (!counts) return;
      if (s.streakKind === o.kind) s.streak++;
      else {
        s.streakKind = o.kind;
        s.streak = 1;
      }
      s.streakT = STREAK_WINDOW;
      if (s.streak >= 3) {
        s.power = { kind: o.kind, left: POWERS[o.kind].dur };
        if (o.kind === 'pot') s.shield = 2;
        s.streak = 0;
        s.streakKind = null;
      }
    };

    let raf = 0;
    let last = performance.now();
    let lastShown = 0;
    let elapsed = 0;

    const zoneFor = (nx: number, ny: number, dir: number): [number, number, number, number] => [
      dir > 0 ? nx - 6 : nx - REACH_X,
      ny - REACH_UP,
      dir > 0 ? nx + NW + REACH_X : nx + NW + 6,
      ny + NH + REACH_DOWN,
    ];
    const inZone = (o: Obstacle, z: [number, number, number, number]) => {
      if (o.kind === 'pot' && o.warn > 0) return false;
      const [x1, y1, x2, y2] = boxOf(o);
      return z[2] > x1 - REACH_PAD && z[0] < x2 + REACH_PAD && z[3] > y1 - REACH_PAD && z[1] < y2 + REACH_PAD;
    };

    const spawn = (s: typeof g.current) => {
      const side: Side = Math.random() < 0.5 ? -1 : 1;
      const early = s.dist < 700;
      const r = Math.random();
      // Mid-streak, lean toward the kind you're collecting so 3-in-a-row is reachable.
      let kind: Kind;
      if (s.streakKind && Math.random() < 0.25) kind = s.streakKind;
      else if (early) kind = r < 0.55 ? 'squirrel' : 'spikes';
      else kind = r < 0.28 ? 'squirrel' : r < 0.52 ? 'spikes' : r < 0.76 ? 'bird' : 'pot';

      if (kind === 'squirrel') s.obstacles.push({ kind, side, y: -30 });
      else if (kind === 'spikes') s.obstacles.push({ kind, side, y: -44 });
      else if (kind === 'bird') {
        const fromLeft = Math.random() < 0.5;
        const vx = (60 + Math.random() * 110) * (fromLeft ? 1 : -1);
        s.obstacles.push({ kind, x: fromLeft ? WALL - 20 : W - WALL - 6, y: -20, vx });
      } else s.obstacles.push({ kind, side, y: -22, warn: 0.9, vy: 0 });
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      const s = g.current;

      if (s.phase === 'running') {
        // Powers: Nut Rush speeds the world up, Eagle Eye slows it down.
        const pk = s.power?.kind;
        const wdt = dt * (pk === 'squirrel' ? 1.9 : pk === 'bird' ? 0.55 : 1);
        s.speed = Math.min(460, 210 + s.dist / 90);
        s.dist += s.speed * wdt;
        s.score = Math.floor(s.dist / 20) + s.bonus;
        s.frame = Math.floor(s.dist / 26) % 2;

        if (s.power) {
          s.power.left -= dt;
          if (s.power.left <= 0) {
            if (s.power.kind === 'pot') s.shield = 0;
            s.power = null;
          }
        }
        if (s.streak > 0) {
          s.streakT -= dt;
          if (s.streakT <= 0) { s.streak = 0; s.streakKind = null; }
        }
        if (s.slashCd > 0) s.slashCd -= dt;
        if (s.slash > 0) s.slash -= dt;
        if (s.wantSlice) {
          s.sliceBuf = SLICE_BUFFER;
          s.wantSlice = false;
        }
        if (s.sliceBuf > 0) {
          s.sliceBuf -= dt;
          if (s.slashCd <= 0) {
            s.slash = SLASH_TIME;
            s.slashCd = SLASH_CD;
            s.sliceBuf = 0;
          }
        }

        if (s.jump) {
          s.jump.t += dt / JUMP_T;
          if (s.jump.t >= 1) {
            s.side = s.jump.to;
            s.jump = null;
            if (s.queued !== null) {
              const q = s.queued;
              s.queued = null;
              if (q !== s.side) startJump(s, q);
            }
          }
        }

        s.spawnAcc += s.speed * wdt;
        if (s.spawnAcc >= s.nextSpawn) {
          s.spawnAcc = 0;
          s.nextSpawn = 240 + Math.random() * 160;
          spawn(s);
        }

        for (const o of s.obstacles) {
          switch (o.kind) {
            case 'squirrel':
              o.y += (s.speed + 110) * wdt;
              break;
            case 'spikes':
              o.y += s.speed * wdt;
              break;
            case 'bird':
              o.y += s.speed * wdt;
              o.x += o.vx * wdt;
              break;
            case 'pot':
              if (o.warn > 0) o.warn -= wdt;
              else {
                o.vy += 380 * wdt;
                o.y += (s.speed + 60 + o.vy) * wdt;
              }
              break;
          }
        }
        s.obstacles = s.obstacles.filter((o) => o.y < H + 60);

        // collision
        const t = s.jump ? Math.min(s.jump.t, 1) : 0;
        const ease = t * t * (3 - 2 * t);
        const nx = s.jump ? xFor(s.jump.from) + (xFor(s.jump.to) - xFor(s.jump.from)) * ease : xFor(s.side);
        const ny = NY - (s.jump ? Math.sin(Math.PI * t) * 26 : 0);
        const n1x = nx + 4, n2x = nx + NW - 4, n1y = ny + 4, n2y = ny + NH - 2;
        // Slice: sweep the arc in front of the ninja (toward the gap).
        if (s.slash > 0) {
          const dir = s.jump ? (s.jump.to > s.jump.from ? 1 : -1) : s.side < 0 ? 1 : -1;
          s.slashDir = dir as 1 | -1;
          const zone = zoneFor(nx, ny, dir);
          s.obstacles = s.obstacles.filter((o) => {
            if (inZone(o, zone)) {
              onDestroyed(s, o, true);
              return false;
            }
            return true;
          });
        }

        const smash = s.power?.kind === 'squirrel' || s.power?.kind === 'spikes';
        for (let i = s.obstacles.length - 1; i >= 0; i--) {
          const o = s.obstacles[i];
          if (o.kind === 'pot' && o.warn > 0) continue;
          const [x1, y1, x2, y2] = boxOf(o);
          if (!(n2x > x1 && n1x < x2 && n2y > y1 && n1y < y2)) continue;
          if (smash) {
            onDestroyed(s, o, false);
            s.obstacles.splice(i, 1);
            continue;
          }
          if (s.shield > 0) {
            s.shield--;
            onDestroyed(s, o, false);
            s.obstacles.splice(i, 1);
            if (s.shield <= 0 && s.power?.kind === 'pot') s.power = null;
            continue;
          }
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

        if (s.score !== lastShown) {
          lastShown = s.score;
          setScore(s.score);
        }
      }

      // ---- draw ----
      const dist = s.dist;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0f1530');
      sky.addColorStop(1, '#2a2f5a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const st of stars) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(elapsed * 2 + st.x);
        ctx.fillStyle = '#fff';
        ctx.fillRect(st.x, (st.y + dist * 0.05) % H, st.r, st.r);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f5ecd6';
      ctx.beginPath();
      ctx.arc(W / 2 + 40, 70, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a2048';
      ctx.beginPath();
      ctx.arc(W / 2 + 50, 64, 20, 0, Math.PI * 2);
      ctx.fill();

      // drifting cloud wisps
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 4; i++) {
        const y = ((dist * 0.4 + i * 170) % (H + 60)) - 30;
        ctx.fillRect(90 + hash(i) * 120, y, 70 + hash(i + 3) * 50, 8);
      }

      // birds sit behind the buildings so they swoop out from behind them
      for (const o of s.obstacles) if (o.kind === 'bird') drawBird(o, Math.floor(elapsed * 10) % 2);

      // buildings
      const wallColor = '#343b66';
      const brick = '#444c80';
      for (const side of [-1, 1] as Side[]) {
        const x0 = side < 0 ? 0 : W - WALL;
        ctx.fillStyle = wallColor;
        ctx.fillRect(x0, 0, WALL, H);
        ctx.fillStyle = brick;
        const off = dist % 24;
        for (let y = -24 + off; y < H; y += 24) ctx.fillRect(x0, y, WALL, 2);
        // windows scroll down as we climb
        const base = dist % 96;
        const idx0 = Math.floor(dist / 96);
        for (let k = -1; k < 7; k++) {
          const lit = hash(idx0 - k + (side < 0 ? 0 : 500)) > 0.5;
          ctx.fillStyle = lit ? '#ffd36b' : '#1f2448';
          const wx = side < 0 ? x0 + 8 : x0 + WALL - 8 - 16;
          ctx.fillRect(wx, base + k * 96 + 30, 16, 22);
        }
        ctx.fillStyle = '#d8d2c2';
        ctx.fillRect(side < 0 ? WALL - 3 : W - WALL, 0, 3, H); // ledge edge
      }

      for (const o of s.obstacles) {
        if (o.kind === 'squirrel') drawSquirrel(o);
        else if (o.kind === 'spikes') drawSpikes(o);
        else if (o.kind === 'pot') drawPot(o, elapsed);
      }

      // ninja
      const t = s.jump ? Math.min(s.jump.t, 1) : 0;
      const ease = t * t * (3 - 2 * t);
      const nx = s.jump ? xFor(s.jump.from) + (xFor(s.jump.to) - xFor(s.jump.from)) * ease : xFor(s.side);
      const ny = NY - (s.jump ? Math.sin(Math.PI * t) * 26 : 0);
      const face: Side = s.jump ? s.jump.to : s.side;
      // face the gap: left-wall ninja looks right, right-wall ninja looks left
      if (s.phase === 'running') {
        const dir0 = s.jump ? (s.jump.to > s.jump.from ? 1 : -1) : s.side < 0 ? 1 : -1;
        const z0 = zoneFor(nx, ny, dir0);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(elapsed * 14);
        for (const o of s.obstacles) {
          if (!inZone(o, z0)) continue;
          const [x1, y1, x2, y2] = boxOf(o);
          ctx.strokeRect(x1 - 4, y1 - 4, x2 - x1 + 8, y2 - y1 + 8);
        }
        ctx.globalAlpha = 1;
      }
      const pw = s.power ? POWERS[s.power.kind] : null;
      if (pw) {
        ctx.globalAlpha = 0.3 + 0.15 * Math.sin(elapsed * 12);
        ctx.fillStyle = pw.color;
        ctx.beginPath();
        ctx.arc(nx + NW / 2, ny + NH / 2, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      drawNinja(nx, ny, (face < 0 ? -1 : 1) as Side, s.frame, s.jump ? (s.jump.to > s.jump.from ? 1 : -1) * t * Math.PI * 2 : 0);
      if (s.shield > 0) {
        ctx.strokeStyle = '#e07b4a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(nx + NW / 2, ny + NH / 2, 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (s.slash > 0) {
        const cx = nx + NW / 2;
        const cy = ny + NH / 2;
        const dir = s.slashDir;
        const life = Math.min(1, s.slash / SLASH_TIME + 0.2);
        const z = zoneFor(nx, ny, dir);
        ctx.globalAlpha = 0.14 * life;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(z[0], z[1], z[2] - z[0], z[3] - z[1]);
        const a0 = dir > 0 ? -1.3 : Math.PI - 1.3;
        ctx.globalAlpha = life;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, 62, a0, a0 + 2.6);
        ctx.stroke();
        ctx.strokeStyle = '#8fd1ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 74, a0 + 0.2, a0 + 2.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        ctx.globalAlpha = Math.max(0, p.life / 0.5);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
      }
      ctx.globalAlpha = 1;
      s.particles = s.particles.filter((p) => p.life > 0);

      if (s.phase === 'running') {
        // streak pips (slice 3 of the same thing = power)
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(W / 2 - 64, 8, 128, 20);
        for (let i = 0; i < 3; i++) {
          const filled = i < s.streak && s.streakKind;
          ctx.fillStyle = filled ? KIND_COLOR[s.streakKind as Kind] : 'rgba(255,255,255,0.2)';
          ctx.fillRect(W / 2 - 54 + i * 16, 13, 12, 10);
        }
        ctx.fillStyle = '#f5ecd6';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(s.streakKind ? `${s.streakKind.toUpperCase()} ${s.streak}/3` : 'SLICE 3 ALIKE', W / 2 - 4, 22);
        if (pw && s.power) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(W / 2 - 64, 32, 128, 18);
          ctx.fillStyle = pw.color;
          ctx.fillRect(W / 2 - 60, 43, 120 * Math.max(0, s.power.left / pw.dur), 4);
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(pw.name, W / 2, 41);
          ctx.textAlign = 'left';
        }
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
    <div className="mx-auto flex flex-col gap-3" style={{ width: `min(100%, calc((90dvh - 262px) * ${W / H}))` }}>
      <div className="flex items-center justify-between font-pixel text-lg leading-none text-ink">
        <span>HI {String(hi).padStart(4, '0')}</span>
        <span>{String(score).padStart(4, '0')} m</span>
      </div>

      <div className="relative overflow-hidden rounded-xl border-[2.5px] border-ink shadow-[3px_3px_0_var(--color-ink)]">
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => { e.preventDefault(); requestSide('toggle'); }}
          className="block w-full cursor-pointer touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Ninja climb game. Press space or tap to leap to the other wall."
        />
        {phase !== 'running' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 px-4 text-center">
            <p className="font-pixel text-3xl text-paper">{phase === 'over' ? 'you fell!' : 'ninja climb'}</p>
            {phase === 'over' && (
              <p className="font-mono text-xs font-bold text-paper">
                {score} m{newHi ? ' · new best!' : ''}
              </p>
            )}
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-paper/80">
              {phase === 'over' ? (canRetry ? 'tap or press space to retry' : '…') : 'tap or press space to start · slice with the button or X'}
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); g.current.wantSlice = true; }}
        aria-label="Slice"
        className="touch-none select-none rounded-xl border-[2.5px] border-ink bg-coral py-3 font-pixel text-xl leading-none text-ink shadow-[3px_3px_0_var(--color-ink)] active:translate-y-px active:shadow-[2px_2px_0_var(--color-ink)]"
      >
        slice!
      </button>

      <p className="text-center font-mono text-[10px] text-ink-soft">
        slice 3 of the same thing for a super power ·
        tap / space to leap walls · ← → pick a side · dodge squirrels, spikes, birds &amp; pots
      </p>
    </div>
  );
}

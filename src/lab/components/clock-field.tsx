"use client";

import { useEffect, useRef } from "react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After A. L. Crego's "Time" (https://x.com/alcrego_): a field of clock
// faces whose hands turn together, so the field reads as one moving thing
// rather than 256 clocks. Every pattern is smooth, each hand only a small
// step from its neighbours, and the field drifts from one to the next: a
// diagonal wave, a vortex, rings, a funnel. It also notices you: the hands
// near the pointer turn to look at it, and a click sends a ring out that
// spins every hand it passes one full turn.

const TAU = Math.PI * 2;
// Faces along each side.
const COUNT = 16;
// One lap of the wave every nine seconds: calm enough to watch.
const SPEED = TAU / 9;
// Each pattern holds for HOLD seconds, then melts into the next over MELT.
const HOLD = 5;
const MELT = 2.6;

// Where a face's hand points at rest, given its place in the field (x and
// y from -1 to 1, centre 0) and its row and column. All of them turn
// together over time, and each is gentle enough that neighbouring hands
// never differ by more than about a twelfth of a turn, which is what makes
// the field read as one surface instead of noise.
const PATTERNS: ((x: number, y: number, col: number, row: number) => number)[] = [
  // A diagonal wave, the original.
  (_x, _y, col, row) => ((col + row) * TAU) / 32,
  // A vortex: one arm wound gently round the centre.
  (x, y) => Math.atan2(-x, y) + Math.PI / 2 + Math.hypot(x, y) * 1.4,
  // Rings spreading out from the middle.
  (x, y) => Math.hypot(x, y) * 3.2,
  // A funnel: every hand points to the centre.
  (x, y) => Math.atan2(-x, y),
];
// How far the pointer's pull reaches, as a share of the field's width.
const REACH = 0.3;
// How quickly a hand catches up with where it wants to point, per second.
const FOLLOW = 9;
// A click's ring: how fast it travels and how wide its band of spinning
// hands is, both as shares of the field's width.
const RING_SPEED = 0.85;
const RING_BAND = 0.22;

type Ring = { x: number; y: number; born: number };

// A hand at angle 0 points to twelve o'clock, turning clockwise.
const shortest = (from: number, to: number) => {
  const d = (to - from) % TAU;
  return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d;
};
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function ClockField({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Everything the loop reads lives in a ref, so moving the pointer never
  // re-renders React.
  const state = useRef({
    size: 0,
    angles: new Float32Array(COUNT * COUNT),
    spun: new Float32Array(COUNT * COUNT),
    seeded: false,
    pointer: { x: 0, y: 0, on: false, pull: 0, releaseAt: 0 },
    rings: [] as Ring[],
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    let frame = 0;
    let last = 0;
    let visible = false;
    const start = performance.now();
    // Index cards idle as a still picture; the page and a hovered card run.
    const animate = !reduceMotion && play !== false;

    let dpr = 1;
    const resize = () => {
      const size = canvas.clientWidth;
      // The screen's own density, page zoom included, so hands stay crisp
      // however close you look.
      dpr = Math.min(window.devicePixelRatio || 1, 4);
      s.size = size;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const step = (now: number, still: boolean) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const t = (now - start) / 1000;
      const { size, angles, spun, pointer, rings } = s;
      if (!size) return;
      const cell = size / COUNT;

      // The card's show: a pointer that circles the middle, and a ring
      // every few seconds.
      if (play) {
        const orbit = t * (TAU / 4.5);
        pointer.x = size / 2 + Math.cos(orbit) * size * 0.26;
        pointer.y = size / 2 + Math.sin(orbit) * size * 0.26;
        pointer.on = true;
        const due = Math.floor(t / 3);
        if (!rings.some((r) => r.born === due) && t - due * 3 < 0.05) {
          rings.push({ x: size / 2, y: size / 2, born: due });
        }
      }
      if (pointer.releaseAt && now > pointer.releaseAt) {
        pointer.on = false;
        pointer.releaseAt = 0;
      }
      // The pull fades in and out rather than switching.
      pointer.pull += ((pointer.on ? 1 : 0) - pointer.pull) * (1 - Math.exp(-6 * dt));

      const reach = REACH * size;
      const ringSpeed = RING_SPEED * size;
      const band = RING_BAND * size;
      const farthest = Math.hypot(size, size);
      // Rings that have crossed the whole field have spun every hand a full
      // turn, which looks the same as none, so they can go.
      const birth = (r: Ring) => (play ? r.born * 3 : r.born);
      for (let k = rings.length - 1; k >= 0; k--) {
        if ((t - birth(rings[k])) * ringSpeed > farthest + band) {
          rings.splice(k, 1);
        }
      }

      // Which pattern the field is in, and how far it has melted into the
      // next one.
      const clock = still ? 0 : t;
      const cycle = HOLD + MELT;
      const p = Math.floor(clock / cycle) % PATTERNS.length;
      const from = PATTERNS[p];
      const to = PATTERNS[(p + 1) % PATTERNS.length];
      const mix = ease(((clock % cycle) - HOLD) / MELT);

      for (let row = 0; row < COUNT; row++) {
        for (let col = 0; col < COUNT; col++) {
          const i = row * COUNT + col;
          const cx = (col + 0.5) * cell;
          const cy = (row + 0.5) * cell;
          const nx = (cx / size) * 2 - 1;
          const ny = (cy / size) * 2 - 1;
          const a = from(nx, ny, col, row);
          let target =
            (mix > 0 ? a + shortest(a, to(nx, ny, col, row)) * mix : a) +
            clock * SPEED;
          if (pointer.pull > 0.001) {
            const dx = pointer.x - cx;
            const dy = pointer.y - cy;
            const d = Math.hypot(dx, dy);
            const weight = pointer.pull * Math.exp(-((d / reach) ** 2));
            const look = Math.atan2(dx, -dy);
            target += shortest(target, look) * weight;
          }
          if (!s.seeded || still) {
            angles[i] = target;
          } else {
            angles[i] += shortest(angles[i], target) * (1 - Math.exp(-FOLLOW * dt));
          }
          // Each ring adds up to one full turn as its band passes; only the
          // change since last frame is applied, so the spin is continuous.
          let spin = 0;
          for (const r of rings) {
            const front = (t - birth(r)) * ringSpeed;
            const d = Math.hypot(cx - r.x, cy - r.y);
            spin += TAU * ease((front - d) / band);
          }
          angles[i] += spin - spun[i];
          spun[i] = spin;
        }
      }
      s.seeded = true;

      const style = getComputedStyle(canvas);
      const radius = cell / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = style.color;
      ctx.beginPath();
      for (let row = 0; row < COUNT; row++) {
        for (let col = 0; col < COUNT; col++) {
          const cx = (col + 0.5) * cell;
          const cy = (row + 0.5) * cell;
          ctx.moveTo(cx + radius, cy);
          ctx.arc(cx, cy, radius, 0, TAU);
        }
      }
      ctx.fill();
      ctx.strokeStyle = style.textDecorationColor;
      // Fine as a watch hand, but never under one real pixel.
      ctx.lineWidth = Math.max(1 / dpr, cell * 0.034);
      ctx.lineCap = "round";
      ctx.beginPath();
      const hand = radius * 0.84;
      for (let row = 0; row < COUNT; row++) {
        for (let col = 0; col < COUNT; col++) {
          const a = angles[row * COUNT + col];
          const cx = (col + 0.5) * cell;
          const cy = (row + 0.5) * cell;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.sin(a) * hand, cy - Math.cos(a) * hand);
        }
      }
      ctx.stroke();
    };

    const loop = (now: number) => {
      step(now, false);
      frame = visible ? requestAnimationFrame(loop) : 0;
    };
    const paint = () => {
      if (!frame) step(performance.now(), !animate);
    };

    resize();
    paint();

    // Sleeps off screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && animate && !frame) {
        last = 0;
        frame = requestAnimationFrame(loop);
      }
    });
    if (animate) io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      paint();
    });
    ro.observe(canvas);
    // Faces and hands follow the theme.
    const mo = new MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", paint);
    // Zooming the page or moving to another screen changes the density;
    // the query only fires once, so it's re-armed each time.
    let density: MediaQueryList | null = null;
    const onDensity = () => {
      resize();
      paint();
      watchDensity();
    };
    const watchDensity = () => {
      density?.removeEventListener("change", onDensity);
      density = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      density.addEventListener("change", onDensity);
    };
    watchDensity();

    // Reduced motion: no loop, but the hands still turn to the pointer, at
    // once.
    const still = () => {
      if (!animate) step(performance.now(), true);
    };

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      // Layout size over drawn size, in case the field is shown scaled.
      const k = s.size / rect.width;
      return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const p = toLocal(e);
      s.pointer.x = p.x;
      s.pointer.y = p.y;
      s.pointer.on = true;
      s.pointer.releaseAt = 0;
      still();
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      s.pointer.on = false;
      if (!animate) {
        s.pointer.pull = 0;
        still();
      }
    };
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      if (e.pointerType === "touch") {
        // A finger can't hover, so a tap is where the hands look for a
        // moment, as well as where the ring starts.
        s.pointer.x = p.x;
        s.pointer.y = p.y;
        s.pointer.on = true;
        s.pointer.releaseAt = performance.now() + 1600;
      }
      if (animate) s.rings.push({ ...p, born: (performance.now() - start) / 1000 });
      still();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (animate) {
        s.rings.push({ x: s.size / 2, y: s.size / 2, born: (performance.now() - start) / 1000 });
      }
    };
    if (play === null) {
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("keydown", onKey);
    }

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      media.removeEventListener("change", paint);
      density?.removeEventListener("change", onDensity);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("keydown", onKey);
      if (play !== null) {
        s.rings = [];
        s.pointer.on = false;
        s.pointer.pull = 0;
      }
    };
  }, [play, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      tabIndex={0}
      aria-label="A field of clock faces turning in a slow wave. The hands follow your pointer; click to send a ripple through them."
      className={cn(
        "block aspect-square w-[420px] max-w-full touch-manipulation text-foreground decoration-background outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-foreground",
        className,
      )}
    />
  );
}

export default function ClockFieldDemo() {
  return <ClockField />;
}

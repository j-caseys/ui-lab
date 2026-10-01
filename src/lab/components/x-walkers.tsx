"use client";

import { useEffect, useRef } from "react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Okazz's X grid study (https://x.com/okazz_): on a field of dots,
// some of the dots are X's, and the X's crawl. To move, an X reaches its
// leading arms out to the next dot, slides its body over, and drags its
// trailing arms after it; arms thin as they stretch, so they read as soft
// limbs rather than sticks. Here they also keep away from your pointer,
// and clicking an empty dot sets a new X down on it.

const TAU = Math.PI * 2;
// Dots along each side.
const COUNT = 17;
// How many X's the field starts with, and the most it will hold.
const START = 22;
const MOST = 60;
// One step: long enough to see the reach, the slide and the pull.
const STEP = 0.95;
// How long an X rests between steps, at least and at most, in seconds.
const REST_MIN = 0.5;
const REST_MAX = 3.2;
// An arm sets off this far through a step: leading arms at 0, trailing
// arms at LAG. Each arm then takes the rest of the step to arrive.
const LAG = 0.3;
const ARM_TRAVEL = 1 - LAG;
// The pointer's reach, in cells, inside which X's step away from it.
const SHY = 3.2;
// A new X grows its arms out over this long.
const GROW = 0.35;
// Points along each side of an arm's outline.
const TAPER = 14;

// Adds one arm to the current path: a smooth outline along a curve from
// the body (cx, cy) through a bend (bx, by) to the tip, wide at the body and
// narrowing to the tip, with round ends. Filled, not stroked, so it has no
// seams.
function armPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bx: number,
  by: number,
  tx: number,
  ty: number,
  base: number,
  tip: number,
) {
  if (base <= 0.01) return;
  // Each arm is its own fill: an outline winds one way or the other with
  // the arm's direction, and two opposite ones in one path would cancel
  // where they overlap.
  ctx.beginPath();
  const left: number[] = [];
  const right: number[] = [];
  for (let s = 0; s <= TAPER; s++) {
    const u = s / TAPER;
    const v = 1 - u;
    const x = v * v * cx + 2 * v * u * bx + u * u * tx;
    const y = v * v * cy + 2 * v * u * by + u * u * ty;
    // The curve's direction here, turned a quarter for the sides.
    let gx = 2 * v * (bx - cx) + 2 * u * (tx - bx);
    let gy = 2 * v * (by - cy) + 2 * u * (ty - by);
    const g = Math.hypot(gx, gy) || 1;
    gx /= g;
    gy /= g;
    const half = (base + (tip - base) * u ** 0.85) / 2;
    left.push(x - gy * half, y + gx * half);
    right.push(x + gy * half, y - gx * half);
  }
  ctx.moveTo(left[0], left[1]);
  for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
  for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
  ctx.closePath();
  ctx.fill();
  // Round ends: the body and the tip.
  ctx.beginPath();
  ctx.arc(cx, cy, base / 2, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(tx, ty, tip / 2, 0, TAU);
  ctx.fill();
}

type Walker = {
  // The dot it's on, or leaving.
  col: number;
  row: number;
  // The dot it's heading for, while stepping.
  toCol: number;
  toRow: number;
  // When the current step began, or -1 at rest.
  stepAt: number;
  // When it next sets off.
  nextAt: number;
  // When it appeared, for the grow-in.
  born: number;
};

// The four arms point along the diagonals.
const ARMS = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
].map(([x, y]) => [x / Math.SQRT2, y / Math.SQRT2]);
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

// Seeded, so the field starts the same way every time.
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function XWalkers({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rand = random(11);
    const animate = !reduceMotion && play !== false;
    const start = performance.now();
    const now = () => (performance.now() - start) / 1000;

    const walkers: Walker[] = [];
    const taken = new Set<number>();
    const key = (c: number, r: number) => r * COUNT + c;
    const place = (col: number, row: number, born: number) => {
      walkers.push({
        col,
        row,
        toCol: col,
        toRow: row,
        stepAt: -1,
        nextAt: born + REST_MIN + rand() * (REST_MAX - REST_MIN),
        born,
      });
      taken.add(key(col, row));
    };
    while (walkers.length < START) {
      const col = Math.floor(rand() * COUNT);
      const row = Math.floor(rand() * COUNT);
      // Already grown, so the first frame is a finished picture.
      if (!taken.has(key(col, row))) place(col, row, -GROW);
    }

    let size = 0;
    let dpr = 1;
    let frame = 0;
    let visible = false;
    const pointer = { x: 0, y: 0, on: false };

    const resize = () => {
      size = canvas.clientWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 4);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    // Grid geometry: an even margin round the dots.
    const layout = () => {
      const margin = size * 0.07;
      const gap = (size - margin * 2) / (COUNT - 1);
      return { margin, gap };
    };

    // Picks the next dot for an X: any free neighbour, or, near the
    // pointer, the free neighbour farthest from it.
    const choose = (w: Walker, t: number) => {
      const { margin, gap } = layout();
      const px = (pointer.x - margin) / gap;
      const py = (pointer.y - margin) / gap;
      const near = pointer.on && Math.hypot(w.col - px, w.row - py) < SHY;
      const options = NEIGHBOURS.map(([dc, dr]) => [w.col + dc, w.row + dr]).filter(
        ([c, r]) => c >= 0 && r >= 0 && c < COUNT && r < COUNT && !taken.has(key(c, r)),
      );
      if (!options.length) {
        w.nextAt = t + 0.4;
        return;
      }
      let pick = options[Math.floor(rand() * options.length)];
      if (near) {
        pick = options.reduce((best, o) =>
          Math.hypot(o[0] - px, o[1] - py) > Math.hypot(best[0] - px, best[1] - py) ? o : best,
        );
      }
      w.toCol = pick[0];
      w.toRow = pick[1];
      w.stepAt = t;
      taken.add(key(pick[0], pick[1]));
    };

    const update = (t: number) => {
      const { margin, gap } = layout();
      for (const w of walkers) {
        if (w.stepAt >= 0 && t - w.stepAt >= STEP) {
          taken.delete(key(w.col, w.row));
          w.col = w.toCol;
          w.row = w.toRow;
          w.stepAt = -1;
          const near =
            pointer.on &&
            Math.hypot(w.col - (pointer.x - margin) / gap, w.row - (pointer.y - margin) / gap) < SHY;
          // Shy ones keep going; the rest take a breather.
          w.nextAt = t + (near ? 0.05 : REST_MIN + rand() * (REST_MAX - REST_MIN));
        }
        if (w.stepAt < 0 && t >= w.nextAt) choose(w, t);
      }
    };

    const draw = (t: number) => {
      if (!size) return;
      const { margin, gap } = layout();
      const ink = getComputedStyle(canvas).color;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      ctx.lineCap = "round";

      // Every dot, always: an X sits over its dot, and the dot is simply
      // there again once it walks off.
      const dot = gap * 0.13;
      ctx.beginPath();
      for (let r = 0; r < COUNT; r++) {
        for (let c = 0; c < COUNT; c++) {
          const x = margin + c * gap;
          const y = margin + r * gap;
          ctx.moveTo(x + dot, y);
          ctx.arc(x, y, dot, 0, TAU);
        }
      }
      ctx.fill();

      // An X a little wider than the gap between dots, so it reads as a mark
      // sitting on the grid rather than a dot that grew.
      const arm = gap * 0.5;
      const thick = gap * 0.36;
      for (const w of walkers) {
        const fx = margin + w.col * gap;
        const fy = margin + w.row * gap;
        const tx = margin + w.toCol * gap;
        const ty = margin + w.toRow * gap;
        const p = w.stepAt >= 0 ? clamp((t - w.stepAt) / STEP) : 0;
        const dx = tx - fx;
        const dy = ty - fy;
        const len = Math.hypot(dx, dy) || 1;
        // The body slides in the middle of the step.
        const body = inOut(clamp((p - 0.2) / 0.6));
        const cx = fx + dx * body;
        const cy = fy + dy * body;
        const grow = inOut(clamp((t - w.born) / GROW));

        for (const [ax, ay] of ARMS) {
          // Arms facing the way it's going set off first.
          const lead = (ax * dx + ay * dy) / len;
          const leave = ((1 - lead) / 2) * LAG;
          const k = inOut(clamp((p - leave) / ARM_TRAVEL));
          const tipX = fx + dx * k + ax * arm * grow;
          const tipY = fy + dy * k + ay * arm * grow;
          const reach = Math.hypot(tipX - cx, tipY - cy);
          // Stretched arms thin out, as if the same ink were pulled longer,
          // and thin most at the tip, so a reaching arm tapers to a point
          // while a resting one is an even bar.
          const stretch = Math.min(1, arm / Math.max(reach, 0.01));
          const base = thick * (0.7 + 0.3 * stretch);
          const tip = Math.max(gap * 0.05, thick * stretch ** 2);
          // A gentle bow off the straight line towards the way the arm
          // rests, so a pulled arm curves like a limb without hooking back
          // on itself; at rest it lies on the line and the arm is straight.
          const bx = (cx + tipX) / 2 + ax * arm * 0.2 * (1 - stretch) * grow;
          const by = (cy + tipY) / 2 + ay * arm * 0.2 * (1 - stretch) * grow;
          armPath(ctx, cx, cy, bx, by, tipX, tipY, base * grow, tip * grow);
        }
      }
    };

    const loop = () => {
      const t = now();
      update(t);
      draw(t);
      frame = visible ? requestAnimationFrame(loop) : 0;
    };
    const paint = () => {
      if (!frame) draw(animate ? now() : 0);
    };

    resize();
    paint();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && animate && !frame) frame = requestAnimationFrame(loop);
    });
    if (animate) io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      paint();
    });
    ro.observe(canvas);
    const mo = new MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", paint);

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      // Layout size over drawn size, in case the field is shown scaled.
      const k = size / rect.width;
      return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      Object.assign(pointer, toLocal(e), { on: true });
    };
    const onLeave = () => {
      pointer.on = false;
    };
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      const { margin, gap } = layout();
      const col = Math.round((p.x - margin) / gap);
      const row = Math.round((p.y - margin) / gap);
      if (col < 0 || row < 0 || col >= COUNT || row >= COUNT) return;
      const t = animate ? now() : -GROW;
      if (!taken.has(key(col, row))) {
        if (walkers.length >= MOST) {
          // Full: the oldest one makes room.
          const old = walkers.shift();
          if (old) {
            taken.delete(key(old.col, old.row));
            if (old.stepAt >= 0) taken.delete(key(old.toCol, old.toRow));
          }
        }
        place(col, row, t);
      } else if (animate) {
        // Poked: whoever is there scurries off at once.
        const w = walkers.find((v) => v.col === col && v.row === row && v.stepAt < 0);
        if (w) w.nextAt = t;
      }
      if (!animate) draw(0);
    };

    if (play === null) {
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("pointerdown", onDown);
    }
    // The card's show is just the crawl; a hovered card animates, an idle
    // one is a still picture.

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      media.removeEventListener("change", paint);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, [play, reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="A grid of dots where some dots are X's that crawl from dot to dot. They keep away from your pointer; click an empty dot to place a new one."
      className={cn(
        "block aspect-square w-[420px] max-w-full touch-manipulation rounded-[28px] bg-surface text-foreground select-none",
        className,
      )}
    />
  );
}

export default function XWalkersDemo() {
  return <XWalkers />;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After bakai's QR code reveal (https://x.com/samakov0): the code leaves
// the button as a cloud of ink dust that billows up and settles, grain by
// grain, into its squares. Hiding blows it back in.

// A real, scannable code for lab.xevrion.dev (version 2, 25 by 25, medium
// error correction), worked out once and kept here so the piece needs no
// QR library.
const CODE = [
  "1111111001001100101111111",
  "1000001000001111101000001",
  "1011101011000011001011101",
  "1011101011010110001011101",
  "1011101011101100101011101",
  "1000001010010111001000001",
  "1111111010101010101111111",
  "0000000011010000000000000",
  "1011111000001101101111100",
  "0011110011010100100100010",
  "0011101110001111001001011",
  "1011100110101000111110001",
  "1110101100011111111010111",
  "1011110001100000100101010",
  "1010101101011011101111011",
  "1001000001010001100110001",
  "1010111001110111111110100",
  "0000000011001001100011000",
  "1111111001000010101010111",
  "1000001011001010100011010",
  "1011101010001111111110111",
  "1011101010000011001011111",
  "1011101011111111100001101",
  "1000001000010000110111001",
  "1111111010111000000111111",
];

// Layout, in CSS px. The code sits above the button and every square sets
// off from the button's top edge.
const W = 300;
const H = 336;
const SIZE = 240;
const CELL = SIZE / CODE.length;
const LEFT = (W - SIZE) / 2;
const TOP = 12;
const ORIGIN = { x: W / 2, y: 292 };

// One flight takes FLY of the timeline. Squares set off in order of their
// distance from the button, so the code fills in as a wave rising out of
// it, and each grain leaves a little after or before its square's turn.
const FLY = 0.46;
const JITTER = 0.1;
const SPREAD = 1 - FLY - JITTER;
// Grains of ink per square: enough to read as a cloud, few enough to stay
// smooth on a phone (about 2,500 in all).
const GRAINS = 8;
// Loose dust that rides along in the cloud and never lands.
const STRAYS = 420;
const REVEAL = 1.45;
const HIDE = 0.95;

// Seeded, so the cloud is the same every time and on every screen.
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Field = {
  // Squares: where they land and when their turn comes.
  squares: { x: number; y: number; at: number }[];
  // Grains, flattened: start delay, a bend point in the cloud, the spot
  // they land on, and their size. Strays fade out instead of landing.
  at: Float32Array;
  bx: Float32Array;
  by: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  size: Float32Array;
  stray: Uint8Array;
};

function buildField(): Field {
  const rand = random(7);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const cells: { x: number; y: number; d: number }[] = [];
  CODE.forEach((row, r) =>
    [...row].forEach((bit, c) => {
      if (bit !== "1") return;
      const x = LEFT + c * CELL;
      const y = TOP + r * CELL;
      cells.push({ x, y, d: Math.hypot(x + CELL / 2 - ORIGIN.x, y + CELL / 2 - ORIGIN.y) });
    }),
  );
  const near = Math.min(...cells.map((c) => c.d));
  const far = Math.max(...cells.map((c) => c.d));
  const squares = cells.map((c) => ({
    x: c.x,
    y: c.y,
    at: ((c.d - near) / (far - near)) * SPREAD,
  }));

  const count = squares.length * GRAINS + STRAYS;
  const field: Field = {
    squares,
    at: new Float32Array(count),
    bx: new Float32Array(count),
    by: new Float32Array(count),
    tx: new Float32Array(count),
    ty: new Float32Array(count),
    size: new Float32Array(count),
    stray: new Uint8Array(count),
  };
  let i = 0;
  const add = (tx: number, ty: number, at: number, stray: boolean) => {
    field.tx[i] = tx;
    field.ty[i] = ty;
    field.at[i] = Math.max(0, at + (rand() - 0.5) * JITTER);
    // The bend sits partway up and wide of the straight line, so grains
    // billow out into a dome before they gather.
    field.bx[i] = ORIGIN.x + (tx - ORIGIN.x) * 0.7 + gauss() * 46;
    field.by[i] = ORIGIN.y + (ty - ORIGIN.y) * 0.55 - rand() * 46;
    field.size[i] = stray ? 0.6 + rand() * 0.8 : 0.8 + rand() * 1.1;
    field.stray[i] = stray ? 1 : 0;
    i += 1;
  };
  for (const sq of squares) {
    for (let g = 0; g < GRAINS; g++) {
      add(sq.x + rand() * CELL, sq.y + rand() * CELL, sq.at, false);
    }
  }
  for (let k = 0; k < STRAYS; k++) {
    // Strays aim anywhere over the code and a little past its edges.
    const tx = LEFT - 20 + rand() * (SIZE + 40);
    const ty = TOP - 16 + rand() * (SIZE + 24);
    const d = Math.hypot(tx - ORIGIN.x, ty - ORIGIN.y);
    add(tx, ty, ((d - near) / (far - near)) * SPREAD, true);
  }
  return field;
}

let field: Field | null = null;

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
// Leaves the button quickly, slows as it gathers into place.
const glide = (t: number) => 1 - (1 - t) ** 2.4;

function draw(canvas: HTMLCanvasElement, s: number, plain: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = canvas.width / W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const ink = getComputedStyle(canvas).color;

  // A viewfinder's corners mark where the code will be, so the empty
  // space reads as waiting rather than blank. They give way as it fills.
  const frame = 0.22 * (1 - smooth(0, 0.35, s));
  if (frame > 0.01) {
    const pad = 6;
    const arm = 24;
    const x0 = LEFT - pad;
    const y0 = TOP - pad;
    const x1 = LEFT + SIZE + pad;
    const y1 = TOP + SIZE + pad;
    ctx.globalAlpha = frame;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0 + arm);
    ctx.arcTo(x0, y0, x0 + arm, y0, 8);
    ctx.lineTo(x0 + arm, y0);
    ctx.moveTo(x1 - arm, y0);
    ctx.arcTo(x1, y0, x1, y0 + arm, 8);
    ctx.lineTo(x1, y0 + arm);
    ctx.moveTo(x1, y1 - arm);
    ctx.arcTo(x1, y1, x1 - arm, y1, 8);
    ctx.lineTo(x1 - arm, y1);
    ctx.moveTo(x0 + arm, y1);
    ctx.arcTo(x0, y1, x0, y1 - arm, 8);
    ctx.lineTo(x0, y1 - arm);
    ctx.stroke();
  }
  if (s <= 0) {
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = ink;
  field ??= buildField();
  const f = field;

  if (!plain) {
    for (let i = 0; i < f.at.length; i++) {
      const local = (s - f.at[i]) / FLY;
      if (local <= 0) continue;
      const stray = f.stray[i] === 1;
      // Landed grains hand over to the solid square; strays just fade.
      if (local >= 1 && !stray) continue;
      const e = glide(Math.min(1, local));
      const u = 1 - e;
      const x = u * u * ORIGIN.x + 2 * u * e * f.bx[i] + e * e * f.tx[i];
      const y = u * u * ORIGIN.y + 2 * u * e * f.by[i] + e * e * f.ty[i];
      const alpha = stray
        ? Math.min(1, local * 4) * (1 - smooth(0.45, 1, local)) * 0.7
        : Math.min(1, local * 4) * (1 - smooth(0.82, 1, local));
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      const r = f.size[i];
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
  }

  // The squares solidify as their grains arrive. A hair over a cell, so
  // neighbours meet without a seam.
  for (const sq of f.squares) {
    const local = (s - sq.at) / FLY;
    const alpha = plain ? Math.min(1, Math.max(0, local)) : smooth(0.72, 1.05, local);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.fillRect(sq.x, sq.y, CELL + 0.4, CELL + 0.4);
  }
  ctx.globalAlpha = 1;
}

export function QrReveal({
  label = "lab.xevrion.dev",
  className,
}: {
  // What the code points to, shown under it once it lands.
  label?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const [own, setOwn] = useState(false);
  const [show, setShow] = useState(false);
  const shown = play ? show : own;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 0 is every square inside the button, 1 is the code complete.
  const timeline = useMotionValue(0);
  const [landed, setLanded] = useState(false);

  // Sharp on any screen, and redrawn as the timeline moves.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const paint = () => draw(canvas, timeline.get(), reduceMotion);
    paint();
    const stop = timeline.on("change", paint);
    // The ink follows the theme, so a theme switch repaints it.
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", paint);
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => {
      stop();
      media.removeEventListener("change", paint);
      observer.disconnect();
    };
  }, [timeline, reduceMotion]);

  useEffect(() => {
    const from = timeline.get();
    const to = shown ? 1 : 0;
    if (from === to) return;
    // Turning round halfway takes only as long as the way back.
    const whole = shown ? REVEAL : HIDE;
    const controls = animate(timeline, to, {
      duration: whole * Math.abs(to - from),
      ease: "linear",
      onComplete: () => setLanded(shown),
    });
    return () => controls.stop();
  }, [shown, timeline]);

  // The card's show: reveal, hold, put away.
  useEffect(() => {
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loop = () => {
      timers.push(setTimeout(() => setShow(true), 400));
      timers.push(setTimeout(() => setShow(false), 2600));
      timers.push(setTimeout(loop, 3600));
    };
    loop();
    return () => {
      timers.forEach(clearTimeout);
      setShow(false);
    };
  }, [play]);

  return (
    <div
      className={cn("relative max-w-full", className)}
      style={{ width: W, height: H }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`QR code for ${label}`}
        aria-hidden={!shown}
        className="absolute inset-0 size-full text-foreground"
      />
      <AnimatePresence>
        {shown && landed && (
          <motion.p
            className="absolute inset-x-0 text-center font-mono text-[12px] text-muted"
            style={{ top: TOP + SIZE + 6 }}
            initial={{ opacity: 0, y: -2, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
            {label}
          </motion.p>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => {
          setLanded(false);
          setOwn((o) => !o);
        }}
        className="absolute left-1/2 flex h-10 -translate-x-1/2 touch-manipulation items-center gap-2 rounded-full bg-background pr-4 pl-3 text-[14px] font-medium shadow-raised outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
        style={{ top: ORIGIN.y - 8 }}
      >
        <svg
          viewBox="0 0 16 16"
          className="size-4"
          fill="currentColor"
          aria-hidden
        >
          <path d="M2 2h5v5H2V2Zm1.5 1.5v2h2v-2h-2ZM9 2h5v5H9V2Zm1.5 1.5v2h2v-2h-2ZM2 9h5v5H2V9Zm1.5 1.5v2h2v-2h-2ZM9 9h2v2H9V9Zm3 0h2v2h-2V9Zm-3 3h2v2H9v-2Zm3 0h2v2h-2v-2Z" />
        </svg>
        <span className="grid">
          {/* Both labels share a cell, so the button keeps its width. */}
          <span className={cn("col-start-1 row-start-1 transition-[opacity] duration-150", shown && "opacity-0")}>
            Show code
          </span>
          <span className={cn("col-start-1 row-start-1 transition-[opacity] duration-150", !shown && "opacity-0")}>
            Hide code
          </span>
        </span>
      </button>
    </div>
  );
}

export default function QrRevealDemo() {
  return <QrReveal />;
}

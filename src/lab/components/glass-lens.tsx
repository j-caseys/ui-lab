"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Gionatannese's GN.D portfolio (https://x.com/gionatannese): a ball of
// glass and chrome that rides over the type and magnifies whatever is under
// it. Press, and the whole paragraph shivers and flushes indigo for a
// moment. Left alone, the lens drifts across the words by itself.

// The lens's radius and how much it enlarges.
const R = 66;
const MAG = 1.75;
// The lens trails the pointer a touch, like something with a little
// weight.
const FOLLOW = { stiffness: 520, damping: 42, mass: 0.6 };

// A press: up fast, then settling out slowly, like a struck surface.
function strike(shiver: MotionValue<number>, reduceMotion: boolean) {
  if (reduceMotion) {
    animate(shiver, [0, 0.4, 0], { duration: 0.6 });
    return;
  }
  animate(shiver, [0, 1, 0], {
    duration: 0.95,
    times: [0, 0.18, 1],
    ease: ["easeOut", [0.22, 1, 0.36, 1]],
  });
}

export function GlassLens({
  text = "Turning bold ideas into ambitious and meticulously crafted things that actually stick.",
  className,
}: {
  text?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const warpId = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const turbulence = useRef<SVGFETurbulenceElement>(null);
  const displace = useRef<SVGFEDisplacementMapElement>(null);
  const [width, setWidth] = useState(0);
  const pointerIn = useRef(false);

  // Where the lens is headed, and where it is.
  const tx = useMotionValue(140);
  const ty = useMotionValue(70);
  const sx = useSpring(tx, FOLLOW);
  const sy = useSpring(ty, FOLLOW);
  const x = reduceMotion ? tx : sx;
  const y = reduceMotion ? ty : sy;

  // The magnified copy is the same paragraph, moved so the spot under the
  // lens sits in its middle, then enlarged about that spot.
  const left = useTransform(x, (v) => v - R);
  const top = useTransform(y, (v) => v - R);
  const innerX = useTransform(x, (v) => R - v);
  const innerY = useTransform(y, (v) => R - v);
  const origin = useMotionTemplate`${x}px ${y}px`;
  const shadowTop = useTransform(top, (v) => v + 16);

  // 0 at rest, 1 at the height of a press.
  const shiver = useMotionValue(0);
  const tint = useTransform(shiver, [0, 0.35, 1], [0, 1, 1]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The shiver drives the warp filter directly, never React.
  useEffect(
    () =>
      shiver.on("change", (v) => {
        displace.current?.setAttribute("scale", String(v * 16));
        turbulence.current?.setAttribute("seed", String(Math.round(v * 40)));
      }),
    [shiver],
  );

  // Drifts over the words while nobody is pointing at it: on a phone, in an
  // index card, or after the pointer leaves.
  useEffect(() => {
    const el = box.current;
    if (!el || reduceMotion || play === false) return;
    let frame = 0;
    let visible = false;
    const start = performance.now();
    const loop = (now: number) => {
      if (!pointerIn.current) {
        const t = (now - start) / 1000;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        // Swings across the words but stays over them, so on a narrow
        // phone it never hangs off the edge or magnifies the margin.
        // Balanced lines stop short of the edge, so it swings a little
        // less than the full width.
        const reachX = Math.max(0, w / 2 - R * 0.9) * 0.72;
        const reachY = Math.max(0, h / 2 - R * 0.7);
        tx.set(w / 2 + reachX * Math.sin(t * 0.42));
        ty.set(h / 2 + reachY * Math.sin(t * 0.67 + 1.2));
      }
      frame = visible ? requestAnimationFrame(loop) : 0;
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(loop);
    });
    io.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [play, reduceMotion, tx, ty]);

  // The card's show: a press every few seconds.
  useEffect(() => {
    if (!play || reduceMotion) return;
    const timer = setInterval(() => strike(shiver, false), 2600);
    return () => clearInterval(timer);
  }, [play, reduceMotion, shiver]);

  const press = () => strike(shiver, reduceMotion);

  const local = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Layout size over drawn size, in case it's shown scaled.
    const k = e.currentTarget.clientWidth / rect.width;
    return { px: (e.clientX - rect.left) * k, py: (e.clientY - rect.top) * k };
  };

  const paragraph = (
    <p className="font-serif text-[clamp(28px,7vw,42px)] leading-[1.12] tracking-[-0.015em] text-balance">
      {text}
    </p>
  );

  return (
    <div
      ref={box}
      className={cn(
        "relative w-[560px] max-w-full touch-none select-none [@media(pointer:fine)]:cursor-none",
        className,
      )}
      onPointerMove={(e) => {
        if (play !== null) return;
        // A finger moves the lens only while it's down, so a scroll that
        // passes over still scrolls.
        if (e.pointerType === "touch" && e.buttons === 0) return;
        const { px, py } = local(e);
        pointerIn.current = true;
        tx.set(px);
        ty.set(py);
      }}
      onPointerDown={(e) => {
        if (play !== null) return;
        const { px, py } = local(e);
        pointerIn.current = true;
        tx.set(px);
        ty.set(py);
        press();
      }}
      onPointerLeave={() => {
        pointerIn.current = false;
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "touch") pointerIn.current = false;
      }}
    >
      <svg aria-hidden className="absolute size-0">
        <filter id={warpId} x="-10%" y="-20%" width="120%" height="140%">
          <feTurbulence
            ref={turbulence}
            type="fractalNoise"
            baseFrequency="0.012 0.045"
            numOctaves={2}
            seed={0}
          />
          <feDisplacementMap
            ref={displace}
            in="SourceGraphic"
            scale={0}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      {/* The words, and an indigo copy laid over them that shows during a
          press, both warped together. */}
      <div className="relative py-6" style={{ filter: `url(#${warpId})` }}>
        <div className="text-foreground">{paragraph}</div>
        <motion.div
          aria-hidden
          className="absolute inset-0 py-6 text-[light-dark(oklch(0.45_0.25_272),oklch(0.72_0.17_272))]"
          style={{ opacity: tint }}
        >
          {paragraph}
        </motion.div>
      </div>

      {/* The lens. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 overflow-hidden rounded-full bg-background"
        style={{ x: left, y: top, width: R * 2, height: R * 2 }}
      >
        <motion.div
          className="absolute top-0 left-0 py-6"
          style={{
            x: innerX,
            y: innerY,
            width: width || undefined,
            scale: MAG,
            transformOrigin: origin,
            filter: `url(#${warpId})`,
          }}
        >
          <div className="text-foreground">{paragraph}</div>
          <motion.div
            className="absolute inset-0 py-6 text-[light-dark(oklch(0.45_0.25_272),oklch(0.72_0.17_272))]"
            style={{ opacity: tint }}
          >
            {paragraph}
          </motion.div>
        </motion.div>

        {/* The glass: darker towards the rim where it bends the most, a
            cool indigo reflection pooled at the bottom, a bright window
            caught at the top left, and a thin chrome edge. */}
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,transparent_58%,rgb(0_0_0/0.18)_80%,rgb(0_0_0/0.55)_100%)]" />
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(120%_70%_at_50%_118%,oklch(0.5_0.24_272/0.55),transparent_60%)] mix-blend-multiply dark:mix-blend-screen" />
        <span className="absolute top-[11%] left-[19%] h-[22%] w-[34%] -rotate-[24deg] rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_255_255/0.95),rgb(255_255_255/0)_100%)]" />
        <span className="absolute top-[30%] left-[14%] size-[7%] rounded-full bg-white/80 blur-[0.5px]" />
        <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.55),inset_0_0_0_2.5px_rgb(0_0_0/0.35),inset_0_10px_18px_-6px_rgb(255_255_255/0.6),inset_0_-14px_22px_-8px_rgb(0_0_0/0.45)]" />
      </motion.div>

      {/* Its shadow on the page, offset down as if lit from above. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -z-10 rounded-full bg-black/25 blur-xl dark:bg-black/60"
        style={{ x: left, y: shadowTop, width: R * 2, height: R * 2 }}
      />
    </div>
  );
}

export default function GlassLensDemo() {
  return <GlassLens />;
}

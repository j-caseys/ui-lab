"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";
import { PreviewPlayContext } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";
import { Arrow } from "./arrow";

export type FreshItem = {
  slug: string;
  name: string;
  description: string;
  category: string;
  credit?: string;
  // The index card's scale, grown for the bigger stage.
  scale: number;
  crop?: boolean;
  preview: React.ReactNode;
};

// Long enough for every show to play through once, short enough that the
// sixth one comes round before anyone looks away.
const EACH = 4.5;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// The newest experiments, playing themselves one after another on a big
// stage, so nobody has to scroll the grid hunting for the "new" tags. It
// waits while you're over it, and sleeps when it's off screen or the tab
// is hidden.
export function JustMade({ items }: { items: FreshItem[] }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tabShown, setTabShown] = useState(true);
  const section = useRef<HTMLElement>(null);
  const progress = useMotionValue(0);
  const current = items[index];
  const running = visible && tabShown && !held;

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(el);
    const onVisibility = () => setTabShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Runs the current item's time down from wherever it was paused, then
  // moves on.
  useEffect(() => {
    if (!running) return;
    const left = (1 - progress.get()) * EACH;
    const controls = animate(progress, 1, {
      duration: left,
      ease: "linear",
      onComplete: () => {
        progress.jump(0);
        setIndex((i) => (i + 1) % items.length);
      },
    });
    return () => controls.stop();
  }, [running, index, items.length, progress]);

  const go = (i: number) => {
    progress.jump(0);
    setIndex(i);
  };

  return (
    <section
      ref={section}
      aria-labelledby="just-made"
      className="mb-16"
      onPointerEnter={(e) => e.pointerType !== "touch" && setHeld(true)}
      onPointerLeave={(e) => e.pointerType !== "touch" && setHeld(false)}
    >
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="just-made" className="flex items-center gap-2 text-[15px] font-medium">
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-marker opacity-60 motion-reduce:hidden" />
            <span className="relative size-2 rounded-full bg-marker" />
          </span>
          Just made
        </h2>
        <p className="text-[13px] text-muted">
          The newest {items.length}, playing on their own
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {/* The stage. A link laid over the whole of it opens the piece
            that's playing; the demo can't sit inside the link, since its
            buttons would be nested in an anchor. */}
        <div className="group/stage relative h-[300px] overflow-hidden rounded-[22px] bg-surface bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_9%,transparent)_1px,transparent_1px)] [background-size:18px_18px] shadow-raised sm:h-[360px]">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={current.slug}
              inert
              className={cn(
                "absolute inset-0 flex justify-center",
                current.crop
                  ? "items-start pt-8 [mask-image:linear-gradient(to_bottom,black_75%,transparent)]"
                  : "items-center",
              )}
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 14, filter: "blur(6px)" }
              }
              animate={{
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
                transition: { duration: 0.45, ease: EASE_OUT },
              }}
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0.15 } }
                  : {
                      opacity: 0,
                      y: -10,
                      filter: "blur(6px)",
                      transition: { duration: 0.25, ease: EASE_OUT },
                    }
              }
            >
              <div
                className="flex shrink-0 justify-center"
                style={{
                  scale: String(current.scale),
                  transformOrigin: current.crop ? "top" : undefined,
                  width: `${100 / current.scale}%`,
                }}
              >
                <PreviewPlayContext value={true}>{current.preview}</PreviewPlayContext>
              </div>
            </motion.div>
          </AnimatePresence>

          <Link
            href={`/lab/${current.slug}`}
            aria-label={`Open ${current.name}`}
            className="absolute inset-0 z-10 rounded-[22px] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground"
          >
            {/* On phones the stage is all demo, so this moves to the
                caption below it. */}
            <span className="absolute right-4 bottom-4 hidden h-8 items-center gap-1 rounded-full md:flex bg-background/85 px-3 text-[13px] font-medium shadow-raised backdrop-blur-sm transition-[translate] duration-150 ease-out group-hover/stage:-translate-y-0.5 motion-reduce:transition-none">
              Open
              <Arrow
                direction="right"
                className="size-3 transition-[translate] duration-150 ease-out group-hover/stage:translate-x-0.5 motion-reduce:transition-none"
              />
            </span>
          </Link>
        </div>

        {/* Phones: story ticks and a caption under the stage. */}
        <div className="md:hidden">
          <div className="flex gap-1.5" role="tablist" aria-label="Newest experiments">
            {items.map((item, i) => (
              <button
                key={item.slug}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={item.name}
                onClick={() => go(i)}
                className="group/tick relative h-6 flex-1 touch-manipulation outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
              >
                <Tick progress={progress} state={i < index ? "done" : i === index ? "now" : "next"} />
              </button>
            ))}
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={current.slug}
              className="flex items-start justify-between gap-4"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)", transition: { duration: 0.3 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              <div className="min-w-0">
                <p className="text-[15px] font-medium">{current.name}</p>
                <p className="mt-0.5 text-sm text-pretty text-muted">
                  {current.description}
                </p>
              </div>
              <Link
                href={`/lab/${current.slug}`}
                className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-surface px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--border)] outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96]"
              >
                Open
                <Arrow direction="right" className="size-3" />
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Wider screens: the line-up, with the one playing filling up. */}
        <ol className="hidden flex-col gap-1 md:flex">
          {items.map((item, i) => {
            const on = i === index;
            return (
              <li key={item.slug} className="flex-1">
                <button
                  type="button"
                  aria-current={on ? "true" : undefined}
                  onClick={() => go(i)}
                  className={cn(
                    "relative flex h-full w-full flex-col justify-center overflow-hidden rounded-2xl px-4 py-2.5 text-left outline-hidden transition-[background-color] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground",
                    on ? "bg-surface" : "hover:bg-surface/60",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span
                      className={cn(
                        "truncate text-[14px] font-medium transition-[color] duration-200 ease-out",
                        on ? "text-foreground" : "text-muted",
                      )}
                    >
                      {item.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted">
                      {item.credit ? `after ${item.credit}` : item.category}
                    </span>
                  </span>
                  {on && (
                    <span className="absolute inset-x-4 bottom-1.5 h-[2px] overflow-hidden rounded-full bg-border">
                      <Fill progress={progress} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Fill({ progress }: { progress: MotionValue<number> }) {
  return (
    <motion.span
      className="block h-full origin-left rounded-full bg-foreground"
      style={{ scaleX: progress }}
    />
  );
}

function Tick({
  progress,
  state,
}: {
  progress: MotionValue<number>;
  state: "done" | "now" | "next";
}) {
  return (
    <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-border">
      <motion.span
        className="block h-full origin-left rounded-full bg-foreground"
        style={{ scaleX: state === "now" ? progress : state === "done" ? 1 : 0 }}
      />
    </span>
  );
}

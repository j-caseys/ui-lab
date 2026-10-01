"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { Caveat } from "next/font/google";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

const hand = Caveat({ subsets: ["latin"], weight: ["500"], preload: false });

// After Nick Pyl's floating action button (https://x.com/nickpylll): the
// plus folds away and the actions it was holding unfold upward out of the
// spot it sat in, over a screen that frosts so they're the only thing left
// to read.

export type FabAction = {
  label: string;
  // The action's own hue, kept as data like an app's brand colours.
  tone: string;
  icon: React.ReactNode;
};

// A row's height plus the gap between rows.
const STEP = 58;
// Springs that settle without a wobble you'd notice, and close quicker
// than they open.
const UNFOLD = { type: "spring", visualDuration: 0.42, bounce: 0.18 } as const;
const FOLD = { type: "spring", visualDuration: 0.26, bounce: 0 } as const;
// Each row leaves a beat after the one below it, so they fan out of the
// button rather than appearing as a block.
const STAGGER = 0.035;

export function FloatingActionMenu({
  actions,
  onAction,
  hint = "tap me, there's more",
  className,
  children,
}: {
  actions: FabAction[];
  onAction?: (label: string) => void;
  // A handwritten nudge at the button, gone once it has been opened.
  hint?: string;
  className?: string;
  // The screen behind the button.
  children?: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const [own, setOwn] = useState(false);
  const [opened, setOpened] = useState(false);
  const [show, setShow] = useState(false);
  const open = play ? show : own;
  const fab = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const menuId = useId();

  // Into the menu when it opens; back to the button when it closes, but
  // only if focus was inside it, so a click elsewhere keeps its focus.
  useEffect(() => {
    if (play) return;
    if (own) {
      first.current?.focus({ preventScroll: true });
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      fab.current?.focus({ preventScroll: true });
    }
  }, [own, play]);

  // The card's show: open, hold, fold away, rest.
  useEffect(() => {
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loop = () => {
      timers.push(setTimeout(() => setShow(true), 500));
      timers.push(setTimeout(() => setShow(false), 2300));
      timers.push(setTimeout(loop, 3400));
    };
    loop();
    return () => {
      timers.forEach(clearTimeout);
      setShow(false);
    };
  }, [play]);

  const close = (returnFocus: boolean) => {
    restoreFocus.current = returnFocus;
    setOwn(false);
  };

  // The rows sit bottom-up: the last action takes the button's own spot.
  const last = actions.length - 1;

  return (
    <div
      className={cn(
        "relative isolate h-[560px] w-[340px] max-w-full overflow-hidden rounded-[44px] bg-background shadow-raised",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape" && own) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      {children}

      {/* Frosts the screen, and is the way out: a tap anywhere else
          closes the menu. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 z-10 bg-background/60 backdrop-blur-md"
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: open ? 0.3 : 0.2, ease: [0.23, 1, 0.32, 1] }}
        style={{ pointerEvents: open ? "auto" : "none" }}
        onClick={() => close(false)}
      />

      <div
        role="menu"
        id={menuId}
        aria-label="Actions"
        inert={!open}
        className="absolute right-5 bottom-5 z-20"
      >
        {actions.map((action, i) => {
          // 0 for the bottom row, which opens first and closes last.
          const fromBottom = last - i;
          return (
            <motion.button
              key={action.label}
              ref={i === 0 ? first : undefined}
              type="button"
              role="menuitem"
              onClick={() => {
                onAction?.(action.label);
                close(true);
              }}
              className="absolute right-0 bottom-0 flex h-14 items-center gap-3 rounded-full pr-[15px] pl-3 text-[17px] font-medium whitespace-nowrap outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
              // Grows out of the icon end, where the button was.
              style={{ transformOrigin: "calc(100% - 28px) 50%" }}
              initial={false}
              animate={
                open
                  ? {
                      y: -fromBottom * STEP,
                      scale: 1,
                      opacity: 1,
                      filter: "blur(0px)",
                      transition: reduceMotion
                        ? { duration: 0.15 }
                        : { ...UNFOLD, delay: fromBottom * STAGGER },
                    }
                  : {
                      y: reduceMotion ? -fromBottom * STEP : 0,
                      scale: reduceMotion ? 1 : 0.35,
                      opacity: 0,
                      filter: reduceMotion ? "blur(0px)" : "blur(6px)",
                      transition: reduceMotion
                        ? { duration: 0.12 }
                        : { ...FOLD, delay: (last - fromBottom) * STAGGER },
                    }
              }
            >
              {action.label}
              <span
                className="grid size-[26px] place-items-center"
                style={{ color: action.tone }}
              >
                {action.icon}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="absolute right-5 bottom-5 z-20 size-14">
        {hint && <Hint text={hint} gone={opened || open} />}
        <motion.button
          ref={fab}
          type="button"
          aria-label="Actions"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => {
            setOwn(true);
            setOpened(true);
          }}
          className="relative grid size-14 touch-manipulation place-items-center rounded-full bg-foreground text-background shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
          initial={false}
          animate={
            open
              ? {
                  scale: 0.5,
                  opacity: 0,
                  filter: reduceMotion ? "blur(0px)" : "blur(4px)",
                }
              : { scale: 1, opacity: 1, filter: "blur(0px)" }
          }
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          transition={
            open
              ? { duration: 0.18, ease: [0.23, 1, 0.32, 1] }
              : { ...UNFOLD, delay: 0.08 }
          }
          style={{ pointerEvents: open ? "none" : "auto" }}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-[22px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M8 2.5v11M2.5 8h11" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}

// One pen stroke, never lifted: out from the note, a quick doodled loop,
// down to the button, then both barbs of the head flicked out by doubling
// back over the first, so the head arrives when the pen gets there.
const ARROW =
  "M3 9C14 3.5 29 3 40 10.5C48.5 16.5 49 28 41.5 28.8C34.5 29.6 35.2 18.6 44 19.8C53.5 21 59 33.5 61.2 47.8" +
  "C58.8 44.6 55.8 42.6 52.4 41.8C55.8 42.6 58.8 44.6 61.2 47.8C62.6 44.2 64.4 40.6 67 38.2";

// Written above and to the left in red pen, with an arrow that curls down
// to the button. It draws in once when it comes into view, and leaves for
// good the first time the menu opens.
function Hint({ text, gone }: { text: string; gone: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setDrawn(true);
        io.disconnect();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const stroke =
    "[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] delay-300 duration-[900ms] ease-[cubic-bezier(0.45,0,0.25,1)] group-data-[drawn=true]/hint:[stroke-dashoffset:0] motion-reduce:transition-none";

  return (
    <span
      ref={ref}
      aria-hidden
      data-drawn={drawn}
      className={cn(
        // Placed so the arrowhead lands just above the button, a little
        // left of its middle: the head is at (61, 48) in the 80x60 arrow,
        // which hangs 46px past the note's right edge and 4px below it.
        "group/hint pointer-events-none absolute right-[61px] bottom-full flex w-max flex-col items-end text-marker transition-[opacity,filter,translate] duration-300 ease-out",
        gone && "-translate-y-1 opacity-0 blur-[2px]",
      )}
    >
      <span
        className={cn(
          hand.className,
          "translate-y-1 -rotate-6 text-[22px] leading-none opacity-0 transition-[opacity,translate] delay-100 duration-300 ease-out group-data-[drawn=true]/hint:translate-y-0 group-data-[drawn=true]/hint:opacity-100 motion-reduce:transition-none",
        )}
      >
        {text}
      </span>
      <svg
        viewBox="0 0 80 60"
        className="mt-0.5 mr-[-46px] -mb-1 h-[60px] w-20 overflow-visible"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ARROW} pathLength={1} strokeWidth={2.1} className={stroke} />
        {/* A thinner pass a hair off the first: ink pooling where the nib
            pressed, so the line isn't a uniform vector stroke. */}
        <path
          d={ARROW}
          pathLength={1}
          strokeWidth={1.1}
          opacity={0.55}
          transform="translate(0.6 0.4)"
          className={stroke}
        />
      </svg>
    </span>
  );
}

const ICON = {
  viewBox: "0 0 24 24",
  className: "size-[26px]",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// Each action keeps its own colour, a step lighter in dark mode.
const ACTIONS: FabAction[] = [
  {
    label: "Receive",
    tone: "light-dark(oklch(0.66 0.19 42), oklch(0.74 0.16 45))",
    icon: (
      <svg {...ICON}>
        <path d="M12 4v15M6 13l6 6 6-6" />
      </svg>
    ),
  },
  {
    label: "Send",
    tone: "light-dark(oklch(0.55 0.22 290), oklch(0.7 0.17 290))",
    icon: (
      <svg {...ICON} strokeWidth={2}>
        <path
          d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3Z"
          fill="currentColor"
          fillOpacity={0.9}
        />
      </svg>
    ),
  },
  {
    label: "Swap",
    tone: "light-dark(oklch(0.57 0.2 258), oklch(0.72 0.15 255))",
    icon: (
      <svg {...ICON}>
        <path d="M4 9.5h13.5L14 6M20 14.5H6.5L10 18" />
      </svg>
    ),
  },
];

const Muted = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted">{children}</span>
);

// A wallet home screen, so the button has something real to cover.
function WalletScreen() {
  return (
    <div className="flex h-full flex-col p-5 pt-8">
      <p className="px-1 text-[13px] text-muted">Good evening, Yash</p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-[26px] bg-surface p-4">
          <p className="text-[12px] text-muted">Spending</p>
          <p className="mt-6 text-[22px] font-semibold tracking-tight tabular-nums">
            $1,265<Muted>.75</Muted>
          </p>
        </div>
        <div className="rounded-[26px] bg-surface p-4">
          <p className="text-[12px] text-muted">Savings</p>
          <p className="mt-6 text-[22px] font-semibold tracking-tight tabular-nums">
            $3,498<Muted>.41</Muted>
          </p>
        </div>
      </div>
      <div className="relative mt-2.5 rounded-[26px] bg-surface p-4">
        <span
          aria-hidden
          className="block size-10 rounded-xl"
          // A brand tile: the gradient is the material, not a theme colour.
          style={{
            background:
              "linear-gradient(140deg, oklch(0.72 0.14 245), oklch(0.5 0.2 262))",
          }}
        />
        <span aria-hidden className="absolute top-4 right-4 text-muted">
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          >
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </span>
        <p className="mt-10 text-[19px] leading-snug font-semibold tracking-tight">
          Earn up to
          <br />
          7.80% APY
        </p>
      </div>
      <div className="mt-auto flex items-center gap-5 px-2 pb-3 text-muted">
        <svg
          viewBox="0 0 16 16"
          className="size-[22px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.75V8l2.25 1.5" />
        </svg>
        <svg
          viewBox="0 0 16 16"
          className="size-[22px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
        </svg>
      </div>
    </div>
  );
}

export default function FloatingActionMenuDemo() {
  return (
    <FloatingActionMenu actions={ACTIONS}>
      <WalletScreen />
    </FloatingActionMenu>
  );
}

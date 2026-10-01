"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Nitish Khagwal's card number reveal (https://x.com/nitishkmrk): the
// number stays masked until you press the eye, the eye turns into the
// copy button, and a ring around it runs down until the number hides again.

type State = "masked" | "shown" | "copied";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Each hidden digit rolls a beat after the one before it, so the number
// reads as being written out left to right rather than switched on.
const STAGGER = 0.03;
const ROLL_IN = { duration: 0.32, ease: EASE_OUT };
// Leaving is quicker and softer than arriving.
const ROLL_OUT = { duration: 0.2, ease: EASE_OUT };
// Long enough to read sixteen digits and copy them, short enough that a
// number left on screen puts itself away.
const SHOWN_FOR = 5000;
// How long the check holds before the number hides.
const COPIED_FOR = 1200;
// How much of the number stays visible at each end.
const KEEP = 4;

export function CardNumberReveal({
  number,
  shownFor = SHOWN_FOR,
  className,
}: {
  number: string;
  shownFor?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const [own, setOwn] = useState<State>("masked");
  // The index card acts the whole thing out on its own state, so a show
  // never leaves the real one half revealed.
  const [show, setShow] = useState<State>("masked");
  const state = play ? show : own;
  const shown = state !== "masked";

  const digits = number.replace(/\D/g, "");
  const groups = digits.match(/.{1,4}/g) ?? [];
  const last = digits.slice(-KEEP);

  const ring = useMotionValue(1);
  const ringOpacity = useTransform(ring, [0, 0.02], [0, 1]);
  const numberRef = useRef<HTMLSpanElement>(null);

  // Shown: the ring runs down, then the number hides. Copied: the check
  // holds for a moment, then the same.
  useEffect(() => {
    const set = play ? setShow : setOwn;
    if (state === "shown") {
      ring.jump(1);
      const controls = animate(ring, 0, {
        duration: shownFor / 1000,
        ease: "linear",
        onComplete: () => set("masked"),
      });
      // A soft light passes over the digits once they've landed, the moment
      // the number reads as whole.
      const glint = reduceMotion
        ? undefined
        : numberRef.current?.animate(
            [{ maskPosition: "100% 0" }, { maskPosition: "0% 0" }],
            {
              duration: 900,
              delay: (KEEP * 2 * STAGGER + ROLL_IN.duration) * 1000,
              easing: "cubic-bezier(0.65, 0, 0.35, 1)",
            },
          );
      return () => {
        controls.stop();
        glint?.cancel();
      };
    }
    if (state === "copied") {
      const timer = setTimeout(() => set("masked"), COPIED_FOR);
      return () => clearTimeout(timer);
    }
  }, [state, play, shownFor, reduceMotion, ring]);

  // The card's show: someone reaches for the eye, copies, and lets it hide.
  // It never touches the clipboard.
  useEffect(() => {
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loop = () => {
      timers.push(setTimeout(() => setShow("shown"), 500));
      timers.push(setTimeout(() => setShow("copied"), 2300));
      timers.push(setTimeout(loop, 4600));
    };
    loop();
    return () => {
      timers.forEach(clearTimeout);
      setShow("masked");
    };
  }, [play]);

  const reveal = () => setOwn("shown");

  const copy = async () => {
    // Confirm on press: the write is near instant, and waiting for it makes
    // the click feel ignored.
    setOwn("copied");
    try {
      await navigator.clipboard.writeText(digits);
    } catch {
      setOwn("shown");
    }
  };

  let hidden = -1;

  return (
    <div
      className={cn(
        // 10px around the 40px button keeps the radii concentric (22 = 12 +
        // 10) and leaves room for the ring that sits outside it.
        "flex h-[60px] max-w-full items-center gap-5 rounded-[22px] bg-background pr-2.5 pl-6 shadow-raised",
        className,
      )}
    >
      <span className="sr-only">
        {shown
          ? `Card number ${groups.join(" ")}`
          : `Card number ending in ${last}`}
      </span>
      <span
        ref={numberRef}
        aria-hidden
        // The glint is a dimmer band in a mask three times the width of the
        // number, slid across it once. At rest the band sits off the end.
        className="flex gap-[0.45em] text-[20px] font-medium tracking-[0.02em] whitespace-nowrap tabular-nums [mask-image:linear-gradient(90deg,black_40%,rgb(0_0_0/0.25)_50%,black_60%)] [mask-position:100%_0] [mask-size:300%_100%]"
      >
        {groups.map((group, g) => (
          <span key={g} className="flex">
            {[...group].map((digit, d) => {
              const index = g * 4 + d;
              const masked = index >= KEEP && index < digits.length - KEEP;
              if (!masked) return <span key={d}>{digit}</span>;
              hidden += 1;
              return (
                <Rolling
                  key={d}
                  digit={digit}
                  shown={shown}
                  delay={hidden * STAGGER}
                  reduceMotion={reduceMotion}
                />
              );
            })}
          </span>
        ))}
      </span>

      <span className="relative shrink-0">
        {/* The countdown, drawn around the button from the top centre, 5px
            out so it reads as a ring around it rather than its border. */}
        <motion.svg
          aria-hidden
          viewBox="0 0 50 50"
          className="pointer-events-none absolute -inset-[5px] size-[50px] text-green-500"
          initial={false}
          animate={{ opacity: state === "shown" ? 1 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.path
            d="M25 1H33A16 16 0 0 1 49 17V33A16 16 0 0 1 33 49H17A16 16 0 0 1 1 33V17A16 16 0 0 1 17 1Z"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            style={{ pathLength: ring, opacity: ringOpacity }}
          />
        </motion.svg>
        <button
          type="button"
          aria-label={
            state === "masked"
              ? "Show card number"
              : state === "shown"
                ? "Copy card number"
                : "Copied"
          }
          // A press reveals and a second press copies. Never on hover: a card
          // number shouldn't show just because the cursor passed over it.
          onClick={() => {
            if (own === "masked") reveal();
            else if (own === "shown") copy();
          }}
          // Green is the one accent: it means the number is out and safe to
          // take, and solid green means it's taken.
          className={cn(
            "relative grid size-10 touch-manipulation place-items-center rounded-[12px] outline-hidden transition-[background-color,color,scale] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[6px] focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color,color]",
            state === "masked" &&
              "bg-surface text-foreground hover:bg-foreground/10",
            state === "shown" &&
              "bg-green-500/15 text-green-600 dark:text-green-400",
            state === "copied" && "bg-green-500 text-white",
          )}
        >
          <span aria-hidden className="grid">
            <Glyph on={state === "masked"} reduceMotion={reduceMotion}>
              <path d="M1.75 8s2.25-4.5 6.25-4.5S14.25 8 14.25 8 12 12.5 8 12.5 1.75 8 1.75 8Z" />
              <circle cx="8" cy="8" r="2" />
            </Glyph>
            <Glyph on={state === "shown"} reduceMotion={reduceMotion}>
              <rect x="5.25" y="5.25" width="8" height="8" rx="1.75" />
              <path d="M10.75 5.25V4.5A1.75 1.75 0 0 0 9 2.75H4.5A1.75 1.75 0 0 0 2.75 4.5V9a1.75 1.75 0 0 0 1.75 1.75h.75" />
            </Glyph>
            <Glyph on={state === "copied"} reduceMotion={reduceMotion}>
              <path d="m3.5 8.5 3 3 6-7" />
            </Glyph>
          </span>
        </button>
      </span>

      <span className="sr-only" aria-live="polite">
        {state === "shown"
          ? "Card number shown"
          : state === "copied"
            ? "Card number copied"
            : ""}
      </span>
    </div>
  );
}

// One hidden digit: the cross and the digit share a cell, and whichever is
// arriving drops in from above while the other falls out below.
function Rolling({
  digit,
  shown,
  delay,
  reduceMotion,
}: {
  digit: string;
  shown: boolean;
  delay: number;
  reduceMotion: boolean;
}) {
  const arrive = reduceMotion
    ? { opacity: 1 }
    : {
        opacity: 1,
        y: ["-0.6em", "0em"],
        filter: ["blur(4px)", "blur(0px)"],
      };
  const leave = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: "0.6em", filter: "blur(4px)" };
  const fade = { duration: 0.15 };
  return (
    <span className="inline-grid w-[1ch] justify-items-center">
      <motion.span
        className="col-start-1 row-start-1"
        initial={false}
        animate={shown ? arrive : leave}
        transition={
          reduceMotion ? fade : { ...(shown ? ROLL_IN : ROLL_OUT), delay }
        }
      >
        {digit}
      </motion.span>
      <motion.span
        className="col-start-1 row-start-1 text-muted"
        initial={false}
        animate={shown ? leave : arrive}
        transition={
          reduceMotion ? fade : { ...(shown ? ROLL_OUT : ROLL_IN), delay }
        }
      >
        ×
      </motion.span>
    </span>
  );
}

function Glyph({
  on,
  reduceMotion,
  children,
}: {
  on: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.svg
      viewBox="0 0 16 16"
      className="col-start-1 row-start-1 size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={
        on
          ? { opacity: 1, scale: 1, filter: "blur(0px)" }
          : reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
      }
      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
    >
      {children}
    </motion.svg>
  );
}

export default function CardNumberRevealDemo() {
  return <CardNumberReveal number="4485 1996 2057 7516" />;
}

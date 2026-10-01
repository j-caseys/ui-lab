"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Arek's GSAP playground (https://x.com/arknow91): three ways for one
// small button to open, all made of the same liquid. Every shape is drawn
// on a layer that is blurred and then sharpened back, so shapes that come
// near each other melt together and stretch apart on necks. The button
// also leans like a drop towards your pointer.
//
// Anchored: the menu pulls out of the button and snaps loose above it.
// Morphing: the button swells into the menu.
// Speed dial: three options bubble out around it.

type Mode = "anchored" | "morphing" | "dial";
const MODES: { id: Mode; label: string }[] = [
  { id: "anchored", label: "Anchored" },
  { id: "morphing", label: "Morphing" },
  { id: "dial", label: "Speed dial" },
];

// Stage and parts, in px. The button sits low so menus have room above.
const W = 360;
const H = 340;
const CX = W / 2;
const CY = 236;
const BTN = 42;
const PANEL_W = 156;
const PANEL_H = 122;
const GAP = 14;
const DIAL = 40;
const DIAL_AT = [
  { x: -60, y: -30 },
  { x: 0, y: -70 },
  { x: 60, y: -30 },
];
// How far the drop can lean out of the button towards the pointer, and
// from how far away the pointer pulls it.
const LEAN = 26;
const PULL = 150;

// Liquid moves on springs that overshoot a little: the stretch, the snap,
// and the wobble as it settles are what make it read as goo.
const SPRING = { type: "spring", stiffness: 340, damping: 22, mass: 0.9 } as const;
const SNAP = { type: "spring", stiffness: 420, damping: 30 } as const;

const ITEMS = [
  {
    label: "Circle",
    icon: <circle cx="8" cy="8" r="5" />,
  },
  {
    label: "Square",
    icon: <rect x="3.25" y="3.25" width="9.5" height="9.5" rx="2" />,
  },
  {
    label: "Triangle",
    icon: <path d="M8 3 13.5 12.5h-11z" />,
  },
];

function Glyph({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function GooeyMenu({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const gooId = useId().replace(/:/g, "");
  const menuId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>("anchored");
  const [own, setOwn] = useState(false);
  const [show, setShow] = useState(false);
  const open = play ? show : own;
  const [hoverItem, setHoverItem] = useState<number | null>(null);

  // The menu panel, as a centre and a size: it starts as the button.
  const px = useMotionValue(CX);
  const py = useMotionValue(CY);
  const pw = useMotionValue(BTN);
  const ph = useMotionValue(BTN);
  const pr = useMotionValue(BTN / 2);
  // Its top-left corner, worked out from the centre and size.
  const panelX = useTransform(() => px.get() - pw.get() / 2);
  const panelY = useTransform(() => py.get() - ph.get() / 2);
  // The three dial bubbles, as offsets from the button and a size.
  const dx = [useMotionValue(0), useMotionValue(0), useMotionValue(0)];
  const dy = [useMotionValue(0), useMotionValue(0), useMotionValue(0)];
  const ds = [useMotionValue(0), useMotionValue(0), useMotionValue(0)];
  // The drop that leans out of the button.
  const leanX = useMotionValue(0);
  const leanY = useMotionValue(0);
  const lx = useSpring(leanX, { stiffness: 260, damping: 16, mass: 0.7 });
  const ly = useSpring(leanY, { stiffness: 260, damping: 16, mass: 0.7 });

  // Move every liquid part to where this mode and state want it.
  useEffect(() => {
    const go = (v: MotionValue<number>, to: number, t: object = SPRING) =>
      reduceMotion ? v.jump(to) : animate(v, to, t);
    const panelOpen = open && mode !== "dial";
    if (panelOpen) {
      const cy =
        mode === "anchored"
          ? CY - BTN / 2 - GAP - PANEL_H / 2
          : CY + BTN / 2 - PANEL_H / 2;
      go(px, CX);
      go(py, cy);
      go(pw, PANEL_W);
      go(ph, PANEL_H);
      go(pr, 18);
    } else {
      // Home into the button: the menu pours back into it.
      go(px, CX, SNAP);
      go(py, CY, SNAP);
      go(pw, BTN, SNAP);
      go(ph, BTN, SNAP);
      go(pr, BTN / 2, SNAP);
    }
    DIAL_AT.forEach((at, i) => {
      const out = open && mode === "dial";
      // They leave one after another, and come home the other way round.
      const delay = reduceMotion ? 0 : out ? i * 0.05 : (2 - i) * 0.03;
      const t = { ...(out ? SPRING : SNAP), delay };
      go(dx[i], out ? at.x : 0, t);
      go(dy[i], out ? at.y : 0, t);
      go(ds[i], out ? 1 : 0, t);
    });
    // dx, dy and ds are stable motion values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, reduceMotion, px, py, pw, ph, pr]);

  // In the dial, the × reaches towards the option you're on.
  useEffect(() => {
    if (open && mode === "dial" && hoverItem !== null) {
      leanX.set(DIAL_AT[hoverItem].x * 0.5);
      leanY.set(DIAL_AT[hoverItem].y * 0.5);
    }
  }, [open, mode, hoverItem, leanX, leanY]);

  // The card's show: open and close, then on to the next way of opening.
  useEffect(() => {
    if (!play) return;
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      if (step % 2) {
        setShow(true);
      } else {
        setShow(false);
        setMode((m) => MODES[(MODES.findIndex((x) => x.id === m) + 1) % MODES.length].id);
      }
    }, 1300);
    return () => {
      clearInterval(id);
      setShow(false);
    };
  }, [play]);

  const close = (returnFocus: boolean) => {
    setOwn(false);
    setHoverItem(null);
    if (returnFocus) trigger.current?.focus({ preventScroll: true });
  };

  // The drop leans towards the pointer, more the nearer it is.
  const onMove = (e: React.PointerEvent) => {
    if (play !== null || reduceMotion || e.pointerType === "touch") return;
    if (open && mode === "dial" && hoverItem !== null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const k = W / rect.width;
    const vx = (e.clientX - rect.left) * k - CX;
    const vy = (e.clientY - rect.top) * k - CY;
    const d = Math.hypot(vx, vy) || 1;
    const pull = d < PULL ? Math.min(LEAN, d * 0.4) * (1 - d / PULL) ** 0.5 : 0;
    leanX.set((vx / d) * pull);
    leanY.set((vy / d) * pull);
  };
  const settle = () => {
    leanX.set(0);
    leanY.set(0);
  };

  const panelOpen = open && mode !== "dial";
  const panelTop =
    mode === "anchored" ? CY - BTN / 2 - GAP - PANEL_H : CY + BTN / 2 - PANEL_H;

  return (
    <div className={cn("flex w-[360px] max-w-full flex-col items-center gap-3", className)}>
      <div
        ref={stage}
        className="relative w-full select-none"
        style={{ height: H, maxWidth: W }}
        onPointerMove={onMove}
        onPointerLeave={settle}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && open) close(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            close(true);
          }
        }}
      >
        <svg aria-hidden className="absolute size-0">
          <filter id={gooId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </svg>

        {/* The liquid: everything that melts together, on one layer, with
            its shadow cast by the melted shape rather than the parts. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_1px_1px_rgb(0_0_0/0.08))_drop-shadow(0_8px_16px_rgb(0_0_0/0.1))] dark:[filter:drop-shadow(0_0_0.5px_rgb(255_255_255/0.35))_drop-shadow(0_8px_16px_rgb(0_0_0/0.6))]"
        >
          <div
            className="absolute"
            style={{
              left: "50%",
              top: 0,
              width: W,
              height: H,
              marginLeft: -W / 2,
              filter: reduceMotion ? undefined : `url(#${gooId})`,
            }}
          >
            <Blob x={CX} y={CY} size={BTN} />
            <motion.div
              className="absolute top-0 left-0 bg-background dark:bg-surface"
              style={{
                x: lx,
                y: ly,
                left: CX - 13,
                top: CY - 13,
                width: 26,
                height: 26,
                borderRadius: 13,
              }}
            />
            <motion.div
              className="absolute top-0 left-0 bg-background dark:bg-surface"
              style={{ x: panelX, y: panelY, width: pw, height: ph, borderRadius: pr }}
            />
            {DIAL_AT.map((_, i) => (
              <motion.div
                key={i}
                className="absolute bg-background dark:bg-surface"
                style={{
                  left: CX - DIAL / 2,
                  top: CY - DIAL / 2,
                  width: DIAL,
                  height: DIAL,
                  borderRadius: DIAL / 2,
                  x: dx[i],
                  y: dy[i],
                  scale: ds[i],
                }}
              />
            ))}
          </div>
        </div>

        {/* What you read and press, crisp, on top of the liquid. */}
        <div className="absolute top-0 left-1/2" style={{ width: W, height: H, marginLeft: -W / 2 }}>
          <AnimatePresence>
            {panelOpen && (
              <motion.ul
                id={menuId}
                role="menu"
                aria-label="Shapes"
                className="absolute flex flex-col justify-center px-2"
                style={{ left: CX - PANEL_W / 2, top: panelTop, width: PANEL_W, height: PANEL_H }}
                initial="hidden"
                animate="shown"
                exit="hidden"
                variants={{
                  shown: { transition: { staggerChildren: 0.035, delayChildren: 0.1 } },
                  hidden: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
                }}
              >
                {ITEMS.map((item, i) => (
                  <motion.li
                    key={item.label}
                    role="none"
                    variants={{
                      hidden: { opacity: 0, y: 4, filter: "blur(4px)" },
                      shown: { opacity: 1, y: 0, filter: "blur(0px)" },
                    }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      autoFocus={i === 0}
                      onClick={() => close(true)}
                      className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] outline-hidden transition-[background-color] duration-150 ease-out hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
                    >
                      <Glyph className="text-muted">{item.icon}</Glyph>
                      {item.label}
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>

          {DIAL_AT.map((_, i) => (
            <motion.button
              key={ITEMS[i].label}
              type="button"
              aria-label={ITEMS[i].label}
              tabIndex={open && mode === "dial" ? 0 : -1}
              aria-hidden={!(open && mode === "dial")}
              onPointerEnter={() => setHoverItem(i)}
              onPointerLeave={() => {
                setHoverItem(null);
                settle();
              }}
              onFocus={() => setHoverItem(i)}
              onBlur={() => setHoverItem(null)}
              onClick={() => close(true)}
              className="absolute grid place-items-center rounded-full outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
              style={{
                left: CX - DIAL / 2,
                top: CY - DIAL / 2,
                width: DIAL,
                height: DIAL,
                x: dx[i],
                y: dy[i],
                opacity: ds[i],
                pointerEvents: open && mode === "dial" ? "auto" : "none",
              }}
            >
              <Glyph>{ITEMS[i].icon}</Glyph>
            </motion.button>
          ))}

          <button
            ref={trigger}
            type="button"
            aria-label={open ? "Close" : "Open shapes"}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={panelOpen ? menuId : undefined}
            onClick={() => (open ? close(false) : setOwn(true))}
            className="absolute grid touch-manipulation place-items-center rounded-full outline-hidden transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.94]"
            style={{
              left: CX - BTN / 2,
              top: CY - BTN / 2,
              width: BTN,
              height: BTN,
              // In morphing mode the button is under the open panel.
              opacity: open && mode === "morphing" ? 0 : 1,
              pointerEvents: open && mode === "morphing" ? "none" : "auto",
              transition: "opacity 150ms ease-out, scale 150ms ease-out",
            }}
          >
            <motion.span
              className="grid place-items-center"
              initial={false}
              animate={{ rotate: open ? 45 : 0 }}
              transition={reduceMotion ? { duration: 0 } : SNAP}
            >
              <svg
                viewBox="0 0 16 16"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M8 3v10M3 8h10" />
              </svg>
            </motion.span>
          </button>
        </div>
      </div>

      {/* Which way it opens. */}
      <LayoutGroup id={`${gooId}-modes`}>
        <div role="radiogroup" aria-label="How it opens" className="flex gap-1">
          {MODES.map((m) => {
            const on = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={play === null ? 0 : -1}
                onClick={() => {
                  setOwn(false);
                  setHoverItem(null);
                  setMode(m.id);
                }}
                className={cn(
                  "relative h-8 rounded-full px-3.5 text-[13px] outline-hidden transition-[color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground",
                  on ? "text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="mode"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-background shadow-raised dark:bg-surface"
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", visualDuration: 0.3, bounce: 0.15 }}
                  />
                )}
                <span className="relative">{m.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}

function Blob({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <div
      className="absolute bg-background dark:bg-surface"
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

export default function GooeyMenuDemo() {
  return <GooeyMenu />;
}

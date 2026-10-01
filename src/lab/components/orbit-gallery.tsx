"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Gionatannese's GN.D portfolio (https://x.com/gionatannese): a ring
// of small photographs turning slowly round a name. Hover one and the ring
// eases to a stop, the card lifts and straightens, and its neighbours step
// aside; click it and it glides into the middle and grows while the others
// bloom outward. Click anywhere, or press Escape, to send them home.

type Item = { name: string; note: string; photo: string };

// Photos from Unsplash (free to use under the Unsplash License). Each is
// cropped by the CDN to the card's shape: small for the ring, large for an
// open card.
const unsplash = (id: string, w: number) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${Math.round(w * 1.3)}&fit=crop&crop=entropy&q=80&auto=format`;

const ITEMS: Item[] = [
  { name: "Hemp oil", note: "Apothecary", photo: "photo-1611930021592-a8cfd5319ceb" },
  { name: "Black label", note: "Bottle", photo: "photo-1674141838902-6beaf984f308" },
  { name: "Speaker", note: "Hanging", photo: "photo-1702471897028-7839d575aef3" },
  { name: "Dropper", note: "Serum", photo: "photo-1679394270822-fb37412bb6ee" },
  { name: "Two candles", note: "Soy wax", photo: "photo-1616172912573-ed615bc0a14b" },
  { name: "Succulent", note: "Clay pot", photo: "photo-1586652171272-8f18c34f79af" },
  { name: "Sneaker", note: "Leather", photo: "photo-1625860191460-10a66c7384fb" },
  { name: "Candle", note: "Glass jar", photo: "photo-1616172890963-a45e7da8de31" },
  { name: "Shelf set", note: "Apothecary", photo: "photo-1611930021559-4a5cb5c38da3" },
  { name: "Perfume", note: "On stone", photo: "photo-1705899853374-d91c048b81d2" },
  { name: "Ceramics", note: "Stoneware", photo: "photo-1610219171722-87b3f4170557" },
  { name: "Glasses", note: "Round frame", photo: "photo-1686165863154-b8f9d69add82" },
  { name: "Stack", note: "Balanced", photo: "photo-1611930022073-b7a4ba5fcccd" },
  { name: "Amber candle", note: "Wood lid", photo: "photo-1601248546843-33fae10e2751" },
];

// A lap every 70 seconds: present without asking for attention.
const LAP = 70;
// Card size at rest, in px. The open card grows to OPEN of the stage width.
const CARD_W = 50;
const CARD_H = 65;
const OPEN = 0.4;
// A hovered card lifts this much, and how far its neighbours step aside,
// in radians, for the first and second card either side.
const LIFT = 1.45;
const PART = [0.11, 0.045];
// The springs: stiff enough to answer at once, with a little overshoot so
// things settle like objects instead of stopping like a timer.
const STIFF = 190;
const DAMP = 21;

type Spring = { x: number; v: number };
const spring = (s: Spring, to: number, dt: number) => {
  s.v += ((to - s.x) * STIFF - s.v * DAMP) * dt;
  s.x += s.v * dt;
};

export function OrbitGallery({
  items = ITEMS,
  title = "Objects",
  className,
}: {
  items?: Item[];
  title?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const [size, setSize] = useState(520);
  const [hovered, setHovered] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  // The index card's show moves a highlight round the ring.
  const [shown, setShown] = useState<number | null>(null);
  const focus = play ? shown : hovered;

  // What the loop reads each frame.
  const live = useRef({ hovered: focus, open, size });
  const placeNow = useRef<(() => void) | null>(null);
  useEffect(() => {
    live.current = { hovered: focus, open, size };
    if (reduceMotion || play === false) placeNow.current?.();
  }, [focus, open, size, reduceMotion, play]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const n = items.length;
    const make = () => ({ x: 0, v: 0 });
    const state = items.map(() => ({
      x: make(),
      y: make(),
      lift: { x: 1, v: 0 },
      grow: make(),
      turn: make(),
      part: make(),
      fade: make(),
      seeded: false,
    }));
    const ringSpeed = (Math.PI * 2) / LAP;
    let angle = -Math.PI / 2;
    let speed = ringSpeed;
    let bloom = 0;
    let frame = 0;
    let last = 0;
    let visible = false;
    const animate = !reduceMotion && play !== false;

    const place = (dt: number, instant: boolean) => {
      const { hovered, open, size } = live.current;
      // The ring brakes smoothly to a stop while anything is in focus.
      const k = instant ? 1 : 1 - Math.exp(-5 * dt);
      speed += ((hovered !== null || open !== null ? 0 : ringSpeed) - speed) * k;
      bloom += ((open !== null ? 1 : 0) - bloom) * (instant ? 1 : 1 - Math.exp(-6 * dt));
      if (animate) angle += speed * dt;
      const ring = size * 0.34;
      // Bloomed out as far as the stage allows, cards and lean included.
      const far = size * 0.43;
      // Cards are laid out at their open size and scaled down to sit in the
      // ring, so the browser always has the full-size picture to draw from;
      // growing one never stretches a small one.
      const rest = CARD_W / (size * OPEN);

      for (let i = 0; i < n; i++) {
        const el = cards.current[i];
        if (!el) continue;
        const s = state[i];
        const isOpen = open === i;
        // Neighbours of the hovered card step aside along the ring.
        let push = 0;
        if (hovered !== null && hovered !== i) {
          let d = i - hovered;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          const away = PART[Math.abs(d) - 1];
          if (away) push = Math.sign(d) * away;
        }
        const a = angle + (i / n) * Math.PI * 2 + s.part.x;
        const r = ring + (far - ring) * bloom * (i % 2 ? 1.07 : 0.95);
        const to = {
          x: isOpen ? 0 : Math.cos(a) * r,
          y: isOpen ? 0 : Math.sin(a) * r,
          lift: isOpen ? 1 : hovered === i ? LIFT : open !== null ? 0.8 : 1,
          grow: isOpen ? 1 : 0,
          // At rest each card leans a few degrees, alternately, like
          // prints dropped on a table; lifted or open, it straightens.
          turn: isOpen || hovered === i ? 0 : (i % 2 ? 1 : -1) * (3 + (i % 3)),
          part: push,
          fade: open !== null && !isOpen ? 1 : 0,
        };
        if (!s.seeded || instant) {
          s.x.x = to.x;
          s.y.x = to.y;
          s.lift.x = to.lift;
          s.grow.x = to.grow;
          s.turn.x = to.turn;
          s.part.x = to.part;
          s.fade.x = to.fade;
          s.seeded = true;
        } else {
          spring(s.x, to.x, dt);
          spring(s.y, to.y, dt);
          spring(s.lift, to.lift, dt);
          spring(s.grow, to.grow, dt);
          spring(s.turn, to.turn, dt);
          spring(s.part, to.part, dt);
          spring(s.fade, to.fade, dt);
        }
        const scale = s.lift.x * (rest + (1 - rest) * Math.max(0, s.grow.x));
        el.style.transform = `translate3d(${s.x.x}px, ${s.y.x}px, 0) rotate(${s.turn.x}deg) scale(${scale})`;
        el.style.zIndex = String(isOpen ? 30 : hovered === i ? 20 : 1);
        const fade = Math.min(1, Math.max(0, s.fade.x));
        el.style.opacity = String(1 - fade * 0.45);
        el.style.filter = fade > 0.01 ? `blur(${fade * 1.5}px)` : "";
      }
    };

    const loop = (now: number) => {
      // Small fixed steps keep the springs steady even on a slow frame.
      let dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      while (dt > 0) {
        const step = Math.min(dt, 1 / 120);
        place(step, false);
        dt -= step;
      }
      frame = visible ? requestAnimationFrame(loop) : 0;
    };

    place(0, true);
    // Without the loop (reduced motion, or an idle index card), hover and
    // open still rearrange the cards, at once.
    placeNow.current = () => place(0, true);
    if (!animate) return;

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) {
        last = 0;
        frame = requestAnimationFrame(loop);
      }
    });
    io.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [items, play, reduceMotion]);

  // The card's show: the highlight steps round the ring.
  useEffect(() => {
    if (!play) return;
    let i = 0;
    const id = setInterval(() => {
      setShown(i % 3 === 2 ? null : (i * 5) % items.length);
      i += 1;
    }, 1100);
    return () => {
      clearInterval(id);
      setShown(null);
    };
  }, [play, items.length]);

  // Escape sends everything home, and focus back to the card that was open.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      cards.current[open]?.focus({ preventScroll: true });
      setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const label = focus !== null ? items[focus] : null;
  const openH = (size * OPEN * CARD_H) / CARD_W;
  // Each card's layout size: its open size.
  const bigW = size * OPEN;
  const bigH = openH;
  // Open size over ring size.
  const k = bigW / CARD_W;

  return (
    <div
      ref={box}
      className={cn("relative aspect-square w-[520px] max-w-full select-none", className)}
      onClick={(e) => {
        // A click on the empty stage closes; clicks on cards are their own.
        if (e.target === e.currentTarget && open !== null) setOpen(null);
      }}
    >
      {/* The name in the middle: the collection's, or the card you're on. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <AnimatePresence initial={false} mode="popLayout">
          {open === null && (
            <motion.div
              key={label?.name ?? "title"}
              className="text-center"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <p className="text-[14px] font-medium tracking-tight">{label ? label.name : title}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted tabular-nums">
                {label ? label.note : `${items.length} pieces`}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The open card's caption, under it. */}
      <AnimatePresence>
        {open !== null && (
          <motion.div
            key={open}
            // Above the bloomed cards, which can drift under it on a phone.
            className="pointer-events-none absolute inset-x-0 z-40 text-center"
            style={{ top: `calc(50% + ${openH / 2 + 14}px)` }}
            initial={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            animate={{
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: { delay: 0.2, duration: 0.35, ease: [0.23, 1, 0.32, 1] },
            }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <p className="text-[15px] font-medium tracking-tight">{items[open].name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">{items[open].note}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {items.map((item, i) => (
        <button
          key={item.photo}
          ref={(el) => {
            cards.current[i] = el;
          }}
          type="button"
          aria-label={item.name}
          aria-pressed={open === i}
          tabIndex={play === null ? 0 : -1}
          onPointerEnter={(e) => e.pointerType !== "touch" && open === null && setHovered(i)}
          onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
          onFocus={() => open === null && setHovered(i)}
          onBlur={() => setHovered((h) => (h === i ? null : h))}
          onClick={() => {
            setHovered(null);
            setOpen((o) => (o === i ? null : i));
          }}
          className="absolute top-1/2 left-1/2 overflow-hidden bg-surface outline-hidden will-change-transform focus-visible:outline-solid focus-visible:outline-foreground"
          style={{
            width: bigW,
            height: bigH,
            marginLeft: -bigW / 2,
            marginTop: -bigH / 2,
            // Corners, shadow and focus ring are drawn at open size, so
            // they're multiplied up to come out right once scaled down.
            borderRadius: 4 * k,
            boxShadow: `0 ${k}px ${k}px rgb(0 0 0 / 0.1), 0 ${6 * k}px ${14 * k}px ${-6 * k}px rgb(0 0 0 / 0.35)`,
            outlineWidth: 2 * k,
            outlineOffset: 2 * k,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- remote
              CDN crops, sized per state, without an image config. */}
          <img
            // Sharp in the ring even lifted and zoomed in.
            src={unsplash(item.photo, 280)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="size-full object-cover"
          />
          {/* The large print, loaded only once a card is opened, so the
              grown card stays sharp. */}
          {open === i && (
            <motion.img
              src={unsplash(item.photo, 900)}
              alt=""
              decoding="async"
              draggable={false}
              className="absolute inset-0 size-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

export default function OrbitGalleryDemo() {
  return <OrbitGallery />;
}

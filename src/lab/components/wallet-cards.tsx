"use client";

import {
  createContext,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Benji Taylor's money app (https://x.com/benjitaylor): the cards wait
// in a stack peeking out of the home screen. Tap them and the front one lifts
// out and straightens into a carousel while the page around it changes over;
// close it and whichever card you were on drops back to the front of the
// stack.

type CardId = "virtual" | "physical";

const CARDS: {
  id: CardId;
  name: string;
  last4: string;
  number: string;
  cashback: { lifetime: string; week: string };
  days: { day: string; rows: Txn[] }[];
}[] = [
  {
    id: "virtual",
    name: "Virtual card",
    last4: "4791",
    number: "4791 2286 0553 4791",
    cashback: { lifetime: "$96.34", week: "$1.53" },
    days: [
      {
        day: "5 Oct",
        rows: [
          {
            name: "Bluestone Lane",
            kind: "Coffee",
            amount: "$12.40",
            back: "$0.37",
          },
          { name: "Uber", kind: "Travel", amount: "$23.80", back: "$0.71" },
        ],
      },
      {
        day: "4 Oct",
        rows: [
          { name: "Figma", kind: "Software", amount: "$15.00", back: "$0.45" },
        ],
      },
    ],
  },
  {
    id: "physical",
    name: "Physical card",
    last4: "8456",
    number: "5214 9031 7720 8456",
    cashback: { lifetime: "$41.20", week: "$4.21" },
    days: [
      {
        day: "3 Oct",
        rows: [
          {
            name: "Whole Foods",
            kind: "Groceries",
            amount: "$86.20",
            back: "$2.59",
          },
          { name: "Shell", kind: "Fuel", amount: "$54.10", back: "$1.62" },
        ],
      },
      {
        day: "1 Oct",
        rows: [
          {
            name: "Blue Bottle",
            kind: "Coffee",
            amount: "$6.75",
            back: "$0.20",
          },
        ],
      },
    ],
  },
];

type Txn = { name: string; kind: string; amount: string; back: string };

// Screen sizes, in px. The screen gives up width on a narrow phone, and
// everything card-shaped is worked out from whatever width it has, so the
// carousel stays centred and the flight lands true at any size.
const SCREEN_W = 360;
const SCREEN_H = 740;
// Room either side of a card in the carousel, where the next one peeks.
const SIDE = 32;
const GAP = 12;

type Geometry = {
  cardW: number;
  cardH: number;
  step: number;
  // Whether the card can fly between the two screens. Not when the whole
  // thing is drawn scaled down (an index card): the flight is measured on
  // screen but moved in unscaled pixels, so it would land in the wrong
  // place. Scaled, the screens simply cross-fade.
  fly: boolean;
};
function geometry(width: number, fly = true): Geometry {
  const cardW = width - SIDE * 2;
  // A real card's proportions.
  return { cardW, cardH: Math.round(cardW / 1.6), step: cardW + GAP, fly };
}
const Geo = createContext<Geometry>(geometry(SCREEN_W));

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// The card's flight: long enough to follow, with a little settle.
const FLIGHT = { type: "spring", visualDuration: 0.55, bounce: 0.1 } as const;
// When a flight has landed for good, overshoot included, in ms.
const LANDED = 750;

export function WalletCards({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const group = useId();
  const [own, setOwn] = useState<"home" | "cards">("home");
  const [show, setShow] = useState<"home" | "cards">("home");
  const view = play ? show : own;
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const setView = play ? setShow : setOwn;
  const screen = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(SCREEN_W);
  const [scaled, setScaled] = useState(false);
  const geo = geometry(width, !scaled);

  // Layout width, not on-screen width: in a scaled index card the two
  // differ, and the cards are laid out in the former. The difference is
  // also how it knows it's been scaled.
  useLayoutEffect(() => {
    const el = screen.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.offsetWidth);
      const drawn = el.getBoundingClientRect().width;
      setScaled(Math.abs(drawn / el.offsetWidth - 1) > 0.02);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const flight = reduceMotion ? { duration: 0 } : FLIGHT;

  // The card's show: open the cards, swipe across, close on the other one.
  useEffect(() => {
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let round = 0;
    const loop = () => {
      const to = round % 2 === 0 ? 1 : 0;
      timers.push(setTimeout(() => setShow("cards"), 700));
      timers.push(
        setTimeout(
          () =>
            scroller.current?.scrollTo({
              left: to * geometry(scroller.current.offsetWidth).step,
              behavior: "smooth",
            }),
          2000,
        ),
      );
      timers.push(setTimeout(() => setShow("home"), 3400));
      timers.push(
        setTimeout(() => {
          round += 1;
          loop();
        }, 4600),
      );
    };
    loop();
    return () => {
      timers.forEach(clearTimeout);
      setShow("home");
    };
  }, [play]);

  const front = CARDS[active];
  const back = CARDS[1 - active];

  return (
    <LayoutGroup id={group}>
      <Geo value={geo}>
        <div
          ref={screen}
          className={cn(
            "relative isolate max-w-full overflow-hidden rounded-[48px] bg-background shadow-raised",
            className,
          )}
          style={{ width: SCREEN_W, height: SCREEN_H }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && view === "cards") setView("home");
          }}
        >
          <StatusBar />
          <Header view={view} onClose={() => setView("home")} />

          <AnimatePresence initial={false} mode="popLayout">
            {view === "home" ? (
              <motion.div
                key="home"
                className="absolute inset-x-0 top-[96px] bottom-0"
              >
                <Home
                  front={front.id}
                  back={back.id}
                  flight={flight}
                  reduceMotion={reduceMotion}
                  onOpen={() => setView("cards")}
                />
              </motion.div>
            ) : (
              <motion.div
                key="cards"
                className="absolute inset-x-0 top-[96px] bottom-0"
              >
                <Cards
                  active={active}
                  onActive={setActive}
                  scroller={scroller}
                  flight={flight}
                  reduceMotion={reduceMotion}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <TabBar />
        </div>
      </Geo>
    </LayoutGroup>
  );
}

// Content that isn't a card leaves and arrives around the card's flight.
const leaveUp = (reduce: boolean) =>
  reduce
    ? { opacity: 0, transition: { duration: 0.12 } }
    : {
        opacity: 0,
        y: -28,
        filter: "blur(4px)",
        transition: { duration: 0.24, ease: EASE_OUT },
      };
const arrive = (reduce: boolean, i: number) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 26, filter: "blur(4px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.42,
      ease: EASE_OUT,
      delay: reduce ? 0 : 0.14 + i * 0.045,
    },
  },
  exit: reduce
    ? { opacity: 0, transition: { duration: 0.12 } }
    : {
        opacity: 0,
        y: 24,
        filter: "blur(4px)",
        transition: { duration: 0.2, ease: EASE_OUT },
      },
});

function Home({
  front,
  back,
  flight,
  reduceMotion,
  onOpen,
}: {
  front: CardId;
  back: CardId;
  flight: object;
  reduceMotion: boolean;
  onOpen: () => void;
}) {
  const { cardW, cardH, fly } = use(Geo);
  const fade = (i: number) => ({
    initial: reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: -24, filter: "blur(4px)" },
    animate: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.4,
        ease: EASE_OUT,
        delay: reduceMotion ? 0 : 0.12 + i * 0.04,
      },
    },
    exit: leaveUp(reduceMotion),
  });

  return (
    <div className="relative h-full px-[18px]">
      <motion.div {...fade(0)}>
        <p className="flex items-center gap-1 text-[13px] text-muted">
          Total balance
          <Glyph d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        </p>
        <p className="mt-1 text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
          $1,279.97
        </p>
        <p className="mt-2 text-[13px] text-muted">Your money is protected</p>
      </motion.div>

      <motion.div {...fade(1)} className="mt-5 grid grid-cols-4 gap-2">
        {ACTIONS.map(({ label, d }) => (
          <span
            key={label}
            className="flex h-[58px] flex-col items-center justify-center gap-1 rounded-[16px] bg-surface text-[12px] font-medium"
          >
            <Glyph d={d} className="size-[17px]" />
            {label}
          </span>
        ))}
      </motion.div>

      <motion.div {...fade(2)} className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-[18px] bg-surface p-3.5">
          <p className="text-[14px] font-medium">Earnings</p>
          <Row label="Lifetime" value="$94.33" />
          <Row
            label="This month"
            value="$3.00"
            tone="text-green-600 dark:text-green-400"
          />
        </div>
        <div className="rounded-[18px] bg-surface p-3.5">
          <p className="text-[14px] font-medium">Activity</p>
          <Row
            label="Maya"
            value="+$24.00"
            avatar="oklch(0.78 0.11 60)"
            tone="text-green-600 dark:text-green-400"
          />
          <Row
            label="Arjun"
            value="+$8.50"
            avatar="oklch(0.72 0.1 250)"
            tone="text-green-600 dark:text-green-400"
          />
        </div>
      </motion.div>

      {/* The stack: both cards, the one you were last on in front. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open cards"
        className="group/stack absolute inset-x-0 top-[298px] h-[112px] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-4 focus-visible:outline-foreground"
      >
        <span
          className="absolute top-0 left-1/2 block transition-[translate] duration-300 ease-out group-hover/stack:-translate-y-1.5"
          style={{ width: cardW, marginLeft: -cardW / 2 }}
        >
          {/* Only the front card travels. The one behind it doesn't fly in
              from wherever it sat in the carousel (off screen, as often as
              not); it settles in behind the stack as the front card lands. */}
          <motion.div
            key={back}
            className="absolute top-0 left-0"
            style={{ width: cardW, height: cardH }}
            initial={
              reduceMotion
                ? { opacity: 0, rotate: 3.5, x: 8, y: -2 }
                : { opacity: 0, scale: 0.94, rotate: 3.5, x: 8, y: 10 }
            }
            // Tucked behind, turned a little the other way, so both read
            // as a stack without either leaving the screen.
            animate={{
              opacity: 1,
              scale: 1,
              rotate: 3.5,
              x: 8,
              y: -2,
              transition: {
                duration: 0.45,
                ease: EASE_OUT,
                delay: reduceMotion ? 0 : 0.2,
              },
            }}
            // Leaving, it drops away with the sheet rather than hanging
            // in the middle of the screen while the page changes.
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.12 } }
                : {
                    opacity: 0,
                    y: 40,
                    scale: 0.96,
                    transition: { duration: 0.22, ease: EASE_OUT },
                  }
            }
          >
            <CardFace id={back} />
          </motion.div>
          <motion.div
            key={front}
            layoutId={fly ? `${front}-card` : undefined}
            layoutCrossfade={false}
            className="absolute top-0 left-0"
            style={{ width: cardW, height: cardH }}
            initial={fly ? false : { opacity: 0, rotate: -1.5, x: -4, y: 34 }}
            animate={{ opacity: 1, rotate: -1.5, x: -4, y: 14 }}
            exit={
              fly
                ? undefined
                : { opacity: 0, y: 40, transition: { duration: 0.2 } }
            }
            transition={
              fly ? flight : { duration: 0.4, ease: EASE_OUT, delay: 0.12 }
            }
          >
            <CardFace id={front} />
          </motion.div>
        </span>
      </button>

      {/* The rest of home slides in over the bottom of the stack. */}
      <motion.div
        className="absolute inset-x-0 top-[398px] bottom-0 overflow-y-auto overscroll-contain rounded-t-[30px] bg-background px-[18px] pt-3 pb-20 shadow-[0_-10px_24px_-14px_rgb(0_0_0/0.25)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 60 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.42,
            ease: EASE_OUT,
            delay: reduceMotion ? 0 : 0.16,
          },
        }}
        exit={
          reduceMotion
            ? { opacity: 0 }
            : {
                opacity: 0,
                y: 90,
                transition: { duration: 0.26, ease: EASE_OUT },
              }
        }
      >
        <div className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
          <span className="grid size-9 place-items-center rounded-[10px] bg-green-500 text-white">
            <Glyph
              d="M2 5.5h12v6H2z M8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
              className="size-[17px]"
            />
          </span>
          <span>
            <span className="block text-[14px] font-medium">
              Set up direct deposit
            </span>
            <span className="block text-[12px] text-muted">
              Get paid up to two days early
            </span>
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Account
            name="Yash"
            apy="6.00% APY"
            amount="$1,279.97"
            tint="oklch(0.78 0.11 60)"
          />
          <Account
            name="Savings"
            apy="4.10% APY"
            amount="$0"
            tint="oklch(0.72 0.1 250)"
          />
        </div>
      </motion.div>
    </div>
  );
}

function Cards({
  active,
  onActive,
  scroller,
  flight,
  reduceMotion,
}: {
  active: number;
  onActive: (i: number) => void;
  scroller: React.RefObject<HTMLDivElement | null>;
  flight: object;
  reduceMotion: boolean;
}) {
  const { cardW, cardH, step, fly } = use(Geo);
  const { scrollX } = useScroll({ container: scroller });
  const card = CARDS[active];
  // While the card is flying in, the carousel can't be a scroll box: a
  // scroll box clips, and would slice the card mid-flight. So it starts as
  // a plain row shifted to the card you opened on, and becomes scrollable,
  // at that same spot, once the card has landed.
  const [settled, setSettled] = useState(reduceMotion);
  const [opening] = useState(active);

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => setSettled(true), LANDED);
    return () => clearTimeout(timer);
  }, [settled]);

  // Lands scrolling on the card you opened, and keeps whichever card you're
  // on centred if the width changes, a phone turning sideways say.
  const current = useRef(active);
  useEffect(() => {
    current.current = active;
  }, [active]);
  useLayoutEffect(() => {
    if (settled) {
      scroller.current?.scrollTo({
        left: current.current * step,
        behavior: "instant",
      });
    }
  }, [settled, step, scroller]);

  return (
    <div className="relative flex h-full flex-col">
      {/* Above what rises in below it, so the card flies over, not under. */}
      <motion.div
        ref={scroller}
        layoutScroll
        className={cn(
          "relative z-10 flex shrink-0 overscroll-x-contain pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          settled
            ? "snap-x snap-mandatory overflow-x-auto"
            : "overflow-visible",
        )}
        style={{ gap: GAP, paddingInline: SIDE, scrollPaddingInline: SIDE }}
        onScroll={(e) => {
          if (!settled) return;
          const i = Math.round(e.currentTarget.scrollLeft / step);
          if (i !== active && i >= 0 && i < CARDS.length) onActive(i);
        }}
      >
        {CARDS.map((c, i) => (
          <Slide
            key={c.id}
            index={i}
            scrollX={scrollX}
            still={settled ? null : opening}
            reduceMotion={reduceMotion}
          >
            <motion.div
              // Both cards keep an identity for the whole visit (Motion only
              // sets one up when a card first appears). Only the front of
              // the stack has a partner, so only the card you're on flies;
              // its neighbour has nowhere to go and leaves with the page.
              layoutId={fly ? `${c.id}-card` : undefined}
              // Both ends show the same card, so a crossfade between them
              // only reads as the card going see-through mid-flight.
              layoutCrossfade={false}
              style={{ width: cardW, height: cardH }}
              initial={
                i === opening
                  ? fly || reduceMotion
                    ? false
                    : { opacity: 0, y: 30 }
                  : reduceMotion
                    ? false
                    : { opacity: 0, x: 24 }
              }
              animate={{
                rotate: 0,
                x: 0,
                y: 0,
                opacity: 1,
                transition:
                  i === opening && fly
                    ? flight
                    : {
                        duration: 0.45,
                        ease: EASE_OUT,
                        delay: i === opening ? 0.1 : 0.25,
                      },
              }}
              transition={flight}
            >
              <CardFace id={c.id} details />
            </motion.div>
          </Slide>
        ))}
      </motion.div>

      {/* The rest of the page scrolls on its own, clear of the tab bar. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <motion.div
          {...arrive(reduceMotion, 0)}
          className="mx-auto flex h-8 w-fit items-center gap-1.5 rounded-full bg-surface pr-2.5 pl-1 text-[13px] font-medium"
        >
          <span
            className="size-6 rounded-full"
            style={{ background: "oklch(0.78 0.11 60)" }}
          />
          Yash
          <Glyph d="m5 6.5 3 3 3-3" className="size-3.5 text-muted" />
        </motion.div>

        <motion.div
          {...arrive(reduceMotion, 1)}
          className="mt-3 grid h-11 place-items-center rounded-full bg-surface text-[15px] font-medium"
        >
          Manage card
        </motion.div>

        <motion.div
          {...arrive(reduceMotion, 2)}
          className="mt-2 grid grid-cols-2 gap-2"
        >
          <div className="rounded-[18px] bg-surface p-3.5">
            <p className="text-[14px] font-medium">Cashback</p>
            <Swap id={card.id}>
              <Row label="Lifetime" value={card.cashback.lifetime} />
              <Row
                label="This week"
                value={card.cashback.week}
                tone="text-sky-600 dark:text-sky-400"
              />
            </Swap>
          </div>
          <div className="relative overflow-hidden rounded-[18px] bg-surface p-3.5">
            <p className="relative z-10 text-[14px] font-medium">Find ATMs</p>
            <MiniMap />
          </div>
        </motion.div>

        <motion.div {...arrive(reduceMotion, 3)} className="mt-4">
          <Swap id={card.id}>
            {card.days.map(({ day, rows }) => (
              <div key={day} className="mb-3">
                <p className="mb-1 text-[13px] font-medium text-muted">{day}</p>
                {rows.map((t) => (
                  <div key={t.name} className="flex items-center gap-3 py-1.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface">
                      <Glyph
                        d="M2 4.5h12v8H2z M2 7h12"
                        className="size-[15px]"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">
                        {t.name}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {t.kind}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[14px] font-medium tabular-nums">
                        {t.amount}
                      </span>
                      <span className="block text-[12px] text-sky-600 tabular-nums dark:text-sky-400">
                        {t.back}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </Swap>
        </motion.div>
      </div>
    </div>
  );
}

// A carousel slot: the card in the middle is full size, its neighbours sit
// back a touch, following the scroll exactly.
function Slide({
  index,
  scrollX,
  still,
  reduceMotion,
  children,
}: {
  index: number;
  scrollX: MotionValue<number>;
  // Before the carousel can scroll: which card it's resting on.
  still: number | null;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const { cardW, step } = use(Geo);
  const scale = useTransform(
    scrollX,
    [(index - 1) * step, index * step, (index + 1) * step],
    reduceMotion ? [1, 1, 1] : [0.94, 1, 0.94],
  );
  const resting = reduceMotion || index === still ? 1 : 0.94;
  return (
    // Shifted, not scrolled, until the carousel can scroll. A plain style,
    // so it's gone in the same commit that turns scrolling on: snap points
    // are worked out from the shifted boxes, and a shift that lingered a
    // frame would snap the carousel back to the first card.
    <div
      className="relative shrink-0 snap-center"
      style={{
        // The card you opened on flies over its neighbour, as it sat in
        // front of it in the stack.
        zIndex: index === still ? 2 : 1,
        width: cardW,
        transform:
          still === null ? undefined : `translateX(${-still * step}px)`,
      }}
    >
      <motion.div style={{ scale: still === null ? scale : resting }}>
        {children}
      </motion.div>
    </div>
  );
}

// Swaps a card's numbers with a soft blur as you move between cards.
function Swap({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={id}
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{
          opacity: 1,
          filter: "blur(0px)",
          transition: { duration: 0.25 },
        }}
        exit={{
          opacity: 0,
          filter: "blur(4px)",
          transition: { duration: 0.15 },
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// The cards are objects with their own materials, the same in both themes.
function CardFace({ id, details }: { id: CardId; details?: boolean }) {
  const [shown, setShown] = useState(false);
  const card = CARDS.find((c) => c.id === id)!;
  const dark = id === "virtual";
  // On a narrow phone the card's name would run into its button, so it
  // keeps just the last four digits.
  const narrow = use(Geo).cardW < 270;
  return (
    <div
      className={cn(
        "relative size-full overflow-hidden rounded-[18px] shadow-[0_1px_1px_rgb(0_0_0/0.12),0_10px_24px_-10px_rgb(0_0_0/0.45)]",
        dark ? "text-white" : "text-[#2a2a2c]",
      )}
      style={{
        background: dark
          ? "radial-gradient(120% 90% at 85% 0%, #2c2c30, transparent 60%), linear-gradient(140deg, #1d1d20, #0a0a0b)"
          : "linear-gradient(125deg, #f2f2f4 0%, #c7c8cc 38%, #e6e7ea 62%, #a9aaae 100%)",
      }}
    >
      {dark ? <Linework /> : <Brushed />}
      {dark ? (
        <span className="absolute top-3 left-3 rounded-full border border-white/35 px-2 py-0.5 text-[11px] font-medium text-white/90">
          Virtual
        </span>
      ) : (
        <Chip />
      )}
      <AnimatePresence initial={false}>
        {shown && (
          <motion.span
            className="absolute inset-x-0 top-[44%] text-center font-mono text-[17px] tracking-[0.08em] tabular-nums"
            initial={{ opacity: 0, filter: "blur(6px)", y: 4 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{
              opacity: 0,
              filter: "blur(6px)",
              transition: { duration: 0.15 },
            }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            {card.number}
          </motion.span>
        )}
      </AnimatePresence>
      <span
        className={cn(
          "absolute bottom-3.5 left-3.5 text-[12px] font-medium",
          dark ? "text-white/85" : "text-black/60",
        )}
      >
        {narrow ? `•${card.last4}` : `${card.name} •${card.last4}`}
      </span>
      {details ? (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className={cn(
            "absolute right-3 bottom-2.5 flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium outline-hidden transition-[background-color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current active:scale-[0.96]",
            dark
              ? "bg-white/12 hover:bg-white/20"
              : "bg-black/8 hover:bg-black/12",
          )}
        >
          <Glyph
            d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
            className="size-3.5"
          />
          {shown ? "Hide details" : "View details"}
        </button>
      ) : null}
    </div>
  );
}

// Fine white rules and a dashed orbit, like a print on dark plastic.
function Linework() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 296 185"
      className="absolute inset-0 size-full"
      fill="none"
      stroke="white"
    >
      <g strokeOpacity={0.32} strokeWidth={0.8}>
        <path d="M150 -10 L262 195" />
        <path d="M176 -10 L288 195" />
        <path d="M206 -10 L300 160" />
        <path d="M120 -10 L180 195" />
      </g>
      <circle cx="222" cy="78" r="11" strokeOpacity={0.5} strokeWidth={1} />
      <path
        d="M40 200 C110 120 220 70 320 64"
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray="4 5"
      />
    </svg>
  );
}

// Brushed metal grain with the lab's mark pressed into it.
function Brushed() {
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.07) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgb(0 0 0 / 0.03) 0 1px, transparent 1px 5px)",
        }}
      />
      {/* The lab's mark, small and pressed into the metal: shadow along
          the top of each dot, light along the bottom. */}
      <span
        aria-hidden
        className="absolute top-4 right-4 grid grid-cols-3 gap-[5px]"
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="size-[7px] rounded-full"
            style={{
              background: "linear-gradient(160deg, #a9aaae, #d4d5d8)",
              boxShadow:
                "inset 0 1px 1px rgb(0 0 0 / 0.25), 0 0.5px 0 rgb(255 255 255 / 0.8)",
            }}
          />
        ))}
      </span>
    </>
  );
}

function Chip() {
  return (
    <span
      aria-hidden
      className="absolute top-[46px] left-5 block h-[30px] w-[40px] overflow-hidden rounded-[6px]"
      style={{
        background: "linear-gradient(135deg, #e3e3e6, #a8a9ae 55%, #d6d7da)",
        boxShadow:
          "inset 0 0 0 1px rgb(0 0 0 / 0.18), 0 1px 0 rgb(255 255 255 / 0.6)",
      }}
    >
      <svg
        viewBox="0 0 40 30"
        className="size-full"
        fill="none"
        stroke="rgb(0 0 0 / 0.28)"
        strokeWidth={0.8}
      >
        <path d="M0 10h13M0 20h13M27 10h13M27 20h13M13 0v30M27 0v30M13 15h14" />
      </svg>
    </span>
  );
}

function MiniMap() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 150 80"
      className="absolute inset-x-0 bottom-0 h-[62px] w-full"
      fill="none"
    >
      <g className="stroke-border" strokeWidth={1.5}>
        <path d="M-5 60 C30 50 50 70 80 52 S130 30 160 40" />
        <path d="M20 85 L60 10" />
        <path d="M95 85 L120 0" />
        <path d="M-5 30 L160 22" />
      </g>
      <circle cx="104" cy="36" r="7" className="fill-sky-500" />
      <circle cx="104" cy="36" r="2.5" fill="white" />
    </svg>
  );
}

function Row({
  label,
  value,
  tone,
  avatar,
}: {
  label: string;
  value: string;
  tone?: string;
  avatar?: string;
}) {
  return (
    <p className="mt-1.5 flex items-center justify-between gap-2 text-[12px]">
      <span className="flex min-w-0 items-center gap-1.5 text-muted">
        {avatar && (
          <span
            className="size-3.5 shrink-0 rounded-full"
            style={{ background: avatar }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn("font-medium tabular-nums", tone ?? "text-foreground")}
      >
        {value}
      </span>
    </p>
  );
}

function Account({
  name,
  apy,
  amount,
  tint,
}: {
  name: string;
  apy: string;
  amount: string;
  tint: string;
}) {
  return (
    <div className="rounded-[18px] bg-surface p-3.5">
      <p className="flex items-center gap-2 text-[14px] font-medium">
        <span className="size-5 rounded-full" style={{ background: tint }} />
        {name}
      </p>
      <p className="mt-3 text-[11px] font-medium text-green-600 dark:text-green-400">
        {apy}
      </p>
      <p className="text-[19px] font-semibold tracking-tight tabular-nums">
        {amount}
      </p>
    </div>
  );
}

function Header({
  view,
  onClose,
}: {
  view: "home" | "cards";
  onClose: () => void;
}) {
  return (
    <div
      className="relative z-10 flex h-12 items-center px-4"
      style={{ marginTop: 44 }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {view === "home" ? (
          <motion.span
            key="back"
            aria-hidden
            className="grid size-9 place-items-center"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
          >
            <Glyph d="M10 3 5 8l5 5" className="size-[18px]" />
          </motion.span>
        ) : (
          <motion.button
            key="close"
            type="button"
            onClick={onClose}
            aria-label="Close cards"
            className="grid size-9 place-items-center rounded-full outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground"
            initial={{ opacity: 0, scale: 0.6, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
          >
            <Glyph d="m4 4 8 8M12 4l-8 8" className="size-[18px]" />
          </motion.button>
        )}
      </AnimatePresence>
      {/* Centred over the whole bar, so it can't take the close button's
          clicks. */}
      <span className="pointer-events-none absolute inset-x-0 grid place-items-center">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={view}
            className="text-[16px] font-semibold"
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            {view === "home" ? "Money" : "Cards"}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="ml-auto flex gap-1 text-foreground">
        <Glyph
          d="M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.4.2-.7.5-.7 1v.3 M8 11.3v.1"
          className="size-[18px]"
        />
      </span>
    </div>
  );
}

function StatusBar() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 z-10 flex h-11 items-center justify-between px-8 pt-1 text-[14px] font-semibold"
    >
      <span className="tabular-nums">9:41</span>
      <span className="absolute top-2.5 left-1/2 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 18 12" className="h-[11px]" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg
          viewBox="0 0 26 12"
          className="h-[11px]"
          fill="none"
          stroke="currentColor"
        >
          <rect
            x="0.5"
            y="0.5"
            width="22"
            height="11"
            rx="3.5"
            strokeOpacity={0.4}
          />
          <rect
            x="2.5"
            y="2.5"
            width="16"
            height="7"
            rx="2"
            fill="currentColor"
            stroke="none"
          />
          <path
            d="M24.5 4v4"
            strokeOpacity={0.4}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      </span>
    </div>
  );
}

function TabBar() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 bottom-0 z-20 flex h-[64px] items-start justify-around border-t border-border bg-background/90 px-4 pt-3 text-muted backdrop-blur-md"
    >
      {TABS.map((d, i) => (
        <Glyph
          key={i}
          d={d}
          className={cn("size-[22px]", i === 0 && "text-foreground")}
        />
      ))}
      <span className="absolute bottom-2 left-1/2 h-[5px] w-[120px] -translate-x-1/2 rounded-full bg-foreground" />
    </div>
  );
}

function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ACTIONS = [
  { label: "Deposit", d: "M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" },
  { label: "Send", d: "M14 2 7 9M14 2l-4.5 12-2.5-5-5-2.5L14 2Z" },
  {
    label: "Request",
    d: "M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z",
  },
  {
    label: "Transfer",
    d: "M5 2.5v11M2.5 5 5 2.5 7.5 5M11 13.5v-11M8.5 11l2.5 2.5 2.5-2.5",
  },
];

const TABS = [
  "M2.5 7 8 2.5 13.5 7v6.5h-4v-4h-3v4h-4z",
  "M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM11 11l3.5 3.5",
  "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 4.5v3.5l2.5 1.5",
  "M4 6.5a4 4 0 1 1 8 0c0 4 1.5 5 1.5 5h-11S4 10.5 4 6.5ZM6.5 13.5a1.5 1.5 0 0 0 3 0",
  "M2.5 4.5h11v7h-6l-3 2.5v-2.5h-2z",
];

export default function WalletCardsDemo() {
  return <WalletCards />;
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  siAmericanexpress,
  siDiscover,
  siMastercard,
  siStripe,
  siVisa,
} from "simple-icons";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Adam Whitcroft's animated payment card (https://x.com/adamwhitcroft):
// a plain card field that floods with the network's colours, from the
// corner, the moment the first digits give the network away.

type Brand = "stripe" | "visa" | "mastercard" | "amex" | "discover";

type BrandSpec = {
  name: string;
  icon: { path: string };
  test: RegExp;
  length: number;
  gaps: number[];
  cvc: number;
  // The card's colours are brand data, not theme: each one is the network's
  // own hue, deepened so white text sits on it.
  paint: string;
  // The warm edge the flood carries in.
  rim: string;
  glow: string;
};

const BRANDS: Record<Brand, BrandSpec> = {
  // Stripe's test number: everyone who has built a checkout has typed it.
  stripe: {
    name: "Stripe test card",
    icon: siStripe,
    test: /^4242/,
    length: 16,
    gaps: [4, 8, 12],
    cvc: 3,
    paint:
      "radial-gradient(120% 90% at 92% 0%, rgb(140 128 255 / 0.95), transparent 60%), linear-gradient(160deg, #2c1d86, #120a3f)",
    rim: "rgb(196 186 255)",
    glow: "rgb(99 91 255 / 0.45)",
  },
  amex: {
    name: "American Express",
    icon: siAmericanexpress,
    test: /^3[47]/,
    length: 15,
    gaps: [4, 10],
    cvc: 4,
    paint:
      "radial-gradient(120% 90% at 92% 0%, rgb(86 178 255 / 0.9), transparent 60%), linear-gradient(160deg, #0e3d6c, #061a31)",
    rim: "rgb(170 220 255)",
    glow: "rgb(46 119 188 / 0.45)",
  },
  mastercard: {
    name: "Mastercard",
    icon: siMastercard,
    // The 2-series is only 2221 to 2720; 2200 to 2204 belongs to Mir.
    test: /^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/,
    length: 16,
    gaps: [4, 8, 12],
    cvc: 3,
    paint:
      "radial-gradient(90% 80% at 78% 8%, rgb(255 62 46 / 0.85), transparent 62%), radial-gradient(70% 60% at 10% 110%, rgb(255 150 40 / 0.3), transparent 70%), linear-gradient(160deg, #2a0807, #0d0303)",
    rim: "rgb(255 190 120)",
    glow: "rgb(235 0 27 / 0.35)",
  },
  discover: {
    name: "Discover",
    icon: siDiscover,
    test: /^(6011|65|64[4-9])/,
    length: 16,
    gaps: [4, 8, 12],
    cvc: 3,
    paint:
      "radial-gradient(110% 90% at 92% 0%, rgb(255 128 40 / 0.9), transparent 60%), linear-gradient(160deg, #3a1a06, #160902)",
    rim: "rgb(255 210 150)",
    glow: "rgb(255 96 0 / 0.35)",
  },
  visa: {
    name: "Visa",
    icon: siVisa,
    test: /^4/,
    length: 16,
    gaps: [4, 8, 12],
    cvc: 3,
    paint:
      "radial-gradient(120% 90% at 92% 0%, rgb(64 96 255 / 0.9), transparent 60%), linear-gradient(160deg, #141b5c, #070a26)",
    rim: "rgb(255 180 110)",
    glow: "rgb(26 31 113 / 0.5)",
  },
};
// Stripe's test number starts with a 4, so it is checked before Visa.
const ORDER: Brand[] = ["stripe", "amex", "mastercard", "discover", "visa"];

const detect = (digits: string) =>
  ORDER.find((b) => BRANDS[b].test.test(digits)) ?? null;

function format(digits: string, brand: Brand | null) {
  const gaps = brand ? BRANDS[brand].gaps : [4, 8, 12];
  let out = "";
  [...digits].forEach((d, i) => {
    if (gaps.includes(i)) out += " ";
    out += d;
  });
  return out;
}

// Long enough to be seen sweeping across rather than snapping on. An even
// curve: a front-loaded one covers most of the card in the first frames.
const FLOOD = { duration: 0.6, ease: [0.45, 0, 0.2, 1] } as const;
// Backing out is quicker: the card is just going back to plain.
const RETREAT = { duration: 0.35, ease: [0.77, 0, 0.175, 1] } as const;
// When the flood reaches each line (ms), bottom-left first, so the text
// turns white as the colour arrives under it. Going back, the colour leaves
// the top right first, so the order reverses.
const REACH = {
  footer: [130, 190],
  number: [170, 170],
  name: [190, 150],
  title: [260, 110],
} as const;
// The far corner is the last place the flood reaches.
const LOGO_IN = 0.45;

const ITEMS = [
  ["Oat flat white", 4.8],
  ["Almond croissant", 4.2],
  ["Sourdough loaf", 9.5],
] as const;
const SUBTOTAL = ITEMS.reduce((sum, [, price]) => sum + price, 0);
const TAX = Math.round(SUBTOTAL * 0.08 * 100) / 100;
const TOTAL = SUBTOTAL + TAX;

// Random digits rarely match a network, so the flood would go unseen. These
// are the networks' published test numbers, typed in for you on a tap.
const SAMPLES = [
  { label: "Visa", number: "4111111111111111" },
  { label: "Mastercard", number: "5555555555554444" },
  { label: "Amex", number: "378282246310005" },
  // Starts as Visa and floods to Stripe at the fourth digit.
  { label: "Stripe test", number: "4242424242424242" },
] as const;
// Quick enough not to keep anyone waiting, slow enough to read as typing.
const TYPE_EVERY = 55;

export function PaymentCard({
  cardholder = "Yash B",
  samples = true,
  className,
}: {
  cardholder?: string;
  // The row of test cards under the button.
  samples?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [paid, setPaid] = useState(false);
  // The brand underneath stays painted while the new one floods over it.
  const [layers, setLayers] = useState<{
    under: Brand | null;
    over: Brand | null;
  }>({ under: null, over: null });
  const shownBrand = useRef<Brand | null>(null);

  const digits = number.replace(/\D/g, "");
  const brand = detect(digits);
  const spec = brand ? BRANDS[brand] : null;
  const flooded = brand !== null;

  const cardRef = useRef<HTMLDivElement>(null);
  const numberInput = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  // 0 is the flood folded into the bottom-left corner, 1 is the whole card.
  const progress = useMotionValue(0);
  const radius = useTransform(progress, (p) => {
    const card = cardRef.current;
    const reach = card ? Math.hypot(card.offsetWidth, card.offsetHeight) : 400;
    // A little past the far corner, so the soft rim clears it too.
    return p * (reach + 40);
  });
  const clipPath = useMotionTemplate`circle(${radius}px at 0% 100%)`;
  const rim = useMotionTemplate`radial-gradient(circle at 0% 100%, transparent calc(${radius}px - 28px), var(--rim) calc(${radius}px - 6px), transparent ${radius}px)`;
  // The rim only exists while the edge is moving.
  const rimOpacity = useTransform(progress, [0, 0.05, 0.8, 1], [0, 1, 1, 0]);

  // The brand whose colour is in the clipped layer right now, including one
  // that is still pulling back.
  const overBrand = useRef<Brand | null>(null);
  const flow = useRef<ReturnType<typeof animate>>(undefined);

  const repaint = (next: Brand | null) => {
    const previous = shownBrand.current;
    if (next === previous) return;
    shownBrand.current = next;
    flow.current?.stop();
    const run = (to: 0 | 1, how: typeof FLOOD | typeof RETREAT) => {
      if (reduceMotion) progress.jump(to);
      else flow.current = animate(progress, to, how);
    };
    if (!next) {
      setLayers((l) => ({ under: null, over: l.over }));
      run(0, RETREAT);
      return;
    }
    if (!previous && overBrand.current === next && progress.get() > 0) {
      // Typed again while the same colour was pulling back: it turns round
      // from where it is instead of starting over.
      run(1, FLOOD);
      return;
    }
    if (!previous && progress.get() > 0) {
      // A different network mid-retreat: carry on from the current edge so
      // the card never blinks back to plain.
      overBrand.current = next;
      setLayers({ under: null, over: next });
      run(1, FLOOD);
      return;
    }
    overBrand.current = next;
    setLayers({ under: previous, over: next });
    progress.jump(0);
    run(1, FLOOD);
  };

  const typeNumber = (raw: string) => {
    const nextDigits = raw.replace(/\D/g, "");
    const nextBrand = detect(nextDigits);
    const trimmed = nextDigits.slice(0, nextBrand ? BRANDS[nextBrand].length : 19);
    setNumber(format(trimmed, nextBrand));
    setPaid(false);
    repaint(nextBrand);
  };

  // A tapped test card types itself in a digit at a time, so the flood
  // happens the way it would for someone typing, then fills the rest so Pay
  // wakes up too.
  const [trying, setTrying] = useState<string | null>(null);
  const typing = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopTyping = () => {
    typing.current.forEach(clearTimeout);
    typing.current = [];
  };
  useEffect(() => stopTyping, []);

  const tryCard = (sample: (typeof SAMPLES)[number]) => {
    stopTyping();
    setTrying(sample.label);
    // The first digit replaces whatever was there, so the new colour floods
    // straight over the old one rather than the card going plain between.
    setExpiry("");
    setCvc("");
    const step = reduceMotion ? 0 : TYPE_EVERY;
    // Starts with two digits at once: one alone ("3") doesn't name a network
    // yet, and the colour would start backing out before the second lands.
    for (let i = 2; i <= sample.number.length; i++) {
      typing.current.push(
        setTimeout(() => typeNumber(sample.number.slice(0, i)), step * (i - 2)),
      );
    }
    typing.current.push(
      setTimeout(() => {
        setExpiry("12 / 28");
        setCvc(detect(sample.number) === "amex" ? "1234" : "123");
      }, step * (sample.number.length + 2)),
    );
  };

  // Spaces are added as you type, so the caret is put back after the same
  // count of digits rather than the same character index.
  useLayoutEffect(() => {
    const input = numberInput.current;
    if (caret.current === null || !input) return;
    let seen = 0;
    let at = 0;
    while (at < number.length && seen < caret.current) {
      if (/\d/.test(number[at])) seen += 1;
      at += 1;
    }
    input.setSelectionRange(at, at);
    caret.current = null;
  }, [number]);

  // The card's show: someone types a card in, then thinks better of it.
  // Programmatic, so it never takes focus.
  useEffect(() => {
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const script = ["42424242", "55554444"];
    // Each round schedules from its own start: typed in, held, backed out.
    const run = (round: number, start: number) => {
      const target = script[round % script.length];
      let at = start;
      for (let i = 1; i <= target.length; i++) {
        at += 110;
        timers.push(setTimeout(() => typeNumber(target.slice(0, i)), at));
      }
      at += 1200;
      for (let i = target.length - 1; i >= 0; i--) {
        at += 45;
        timers.push(setTimeout(() => typeNumber(target.slice(0, i)), at));
      }
      timers.push(setTimeout(() => run(round + 1, 0), at + 700));
    };
    run(0, 400);
    return () => {
      timers.forEach(clearTimeout);
      typeNumber("");
    };
    // typeNumber is recreated every render but only writes state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  const complete =
    spec !== null &&
    digits.length === spec.length &&
    expiry.replace(/\D/g, "").length === 4 &&
    cvc.length === spec.cvc;

  useEffect(() => {
    if (!paid) return;
    const timer = setTimeout(() => setPaid(false), 1800);
    return () => clearTimeout(timer);
  }, [paid]);

  const ink = ([arrive, leave]: readonly [number, number]) => ({
    transitionDelay: reduceMotion ? "0ms" : `${flooded ? arrive : leave}ms`,
  });
  const inkClass = cn(
    "transition-[color] duration-200 ease-out motion-reduce:transition-none",
    flooded ? "text-white" : "text-foreground",
  );
  const fieldClass =
    "min-w-0 bg-transparent font-mono outline-hidden placeholder:text-current placeholder:opacity-45";

  return (
    <div className={cn("flex w-[340px] max-w-full flex-col gap-2.5", className)}>
      {/* The receipt the card is paying for. */}
      <div className="rounded-[18px] bg-background px-4 py-3.5 font-mono text-[12px] shadow-raised">
        {ITEMS.map(([item, price]) => (
          <p key={item} className="flex justify-between text-muted">
            <span>{item}</span>
            <span className="tabular-nums">{price.toFixed(2)}</span>
          </p>
        ))}
        <p className="mt-1 flex justify-between text-muted">
          <span>Tax</span>
          <span className="tabular-nums">{TAX.toFixed(2)}</span>
        </p>
        <p className="mt-2 flex justify-between border-t border-dashed border-border pt-2 font-medium">
          <span>Total</span>
          <span className="tabular-nums">${TOTAL.toFixed(2)}</span>
        </p>
      </div>

      <div className="relative">
        {/* The network's colour as a soft light under the card: one light
            per network, so switching fades one out and the next in rather
            than dragging a red through purple to a blue. */}
        {ORDER.map((b) => (
          <div
            key={b}
            aria-hidden
            className="absolute inset-x-6 top-6 -bottom-2 rounded-[24px] blur-2xl transition-[opacity] duration-500 ease-out"
            style={{
              backgroundColor: BRANDS[b].glow,
              opacity: brand === b ? 1 : 0,
            }}
          />
        ))}
        <div
          ref={cardRef}
          className="relative isolate h-[196px] overflow-hidden rounded-[18px] bg-background shadow-raised"
        >
          {layers.under && (
            <div
              aria-hidden
              className="absolute inset-0 -z-10"
              style={{ background: BRANDS[layers.under].paint }}
            />
          )}
          {layers.over && (
            <>
              <motion.div
                aria-hidden
                className="absolute inset-0 -z-10"
                style={{ background: BRANDS[layers.over].paint, clipPath }}
              />
              {!reduceMotion && (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 blur-[5px]"
                  style={
                    {
                      "--rim": BRANDS[layers.over].rim,
                      background: rim,
                      opacity: rimOpacity,
                    } as unknown as React.CSSProperties
                  }
                />
              )}
            </>
          )}

          <div className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between">
              <span
                className={cn("text-[14px] font-medium", inkClass)}
                style={ink(REACH.title)}
              >
                Payment
              </span>
              <span className="relative grid h-6 w-14 place-items-end">
                <AnimatePresence initial={false}>
                  {spec && (
                    <motion.svg
                      key={brand}
                      viewBox="0 0 24 24"
                      aria-hidden
                      className="col-start-1 row-start-1 h-6 w-auto fill-white"
                      initial={
                        reduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, scale: 0.8, filter: "blur(4px)" }
                      }
                      animate={{
                        opacity: 1,
                        scale: 1,
                        filter: "blur(0px)",
                        transition: {
                          duration: 0.3,
                          ease: [0.23, 1, 0.32, 1],
                          delay: reduceMotion ? 0 : LOGO_IN,
                        },
                      }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    >
                      <path d={spec.icon.path} />
                    </motion.svg>
                  )}
                </AnimatePresence>
              </span>
            </div>

            <span
              className={cn(
                "mt-auto font-mono text-[11px] tracking-[0.12em] uppercase opacity-70",
                inkClass,
              )}
              style={ink(REACH.name)}
            >
              {cardholder}
            </span>
            <input
              ref={numberInput}
              value={number}
              onChange={(e) => {
                const at = e.target.selectionStart ?? e.target.value.length;
                caret.current = e.target.value.slice(0, at).replace(/\D/g, "").length;
                stopTyping();
                setTrying(null);
                typeNumber(e.target.value);
              }}
              inputMode="numeric"
              autoComplete="cc-number"
              aria-label="Card number"
              placeholder="0000 0000 0000 0000"
              className={cn(
                fieldClass,
                "mt-1.5 text-[19px] tracking-[0.06em] tabular-nums",
                inkClass,
                flooded ? "caret-white" : "caret-foreground",
              )}
              style={ink(REACH.number)}
            />
            <div
              className={cn("mt-2.5 flex gap-4 text-[12px]", inkClass)}
              style={ink(REACH.footer)}
            >
              <input
                value={expiry}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setExpiry(d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d);
                }}
                inputMode="numeric"
                autoComplete="cc-exp"
                aria-label="Expiry date, month and year"
                placeholder="MM / YY"
                className={cn(fieldClass, "w-[7ch]")}
              />
              <input
                value={cvc}
                onChange={(e) =>
                  setCvc(e.target.value.replace(/\D/g, "").slice(0, spec?.cvc ?? 4))
                }
                inputMode="numeric"
                autoComplete="cc-csc"
                aria-label="Security code"
                placeholder="CVC"
                className={cn(fieldClass, "w-[5ch]")}
              />
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!complete && !paid}
        onClick={() => setPaid(true)}
        className="relative h-11 rounded-full bg-foreground text-[14px] font-medium text-background outline-hidden transition-[opacity,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={paid ? "paid" : "pay"}
            className="inline-flex items-center gap-1.5"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            {paid ? (
              <>
                <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
                Paid
              </>
            ) : (
              <>Pay ${TOTAL.toFixed(2)}</>
            )}
          </motion.span>
        </AnimatePresence>
      </button>

      {samples && play === null && (
        <div className="flex flex-wrap items-center justify-center gap-1 pt-1 text-[12px]">
          <span className="mr-1 text-muted">Try</span>
          {SAMPLES.map((sample) => {
            const on = trying === sample.label;
            return (
              <button
                key={sample.label}
                type="button"
                aria-pressed={on}
                aria-label={`Fill in a sample ${sample.label} card`}
                onClick={() => tryCard(sample)}
                className={cn(
                  "h-7 touch-manipulation rounded-full px-2.5 font-medium outline-hidden transition-[background-color,color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[background-color,color]",
                  on
                    ? "bg-foreground text-background"
                    : "bg-surface text-muted hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                {sample.label}
              </button>
            );
          })}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {paid ? "Paid" : spec ? spec.name : ""}
      </p>
    </div>
  );
}

export default function PaymentCardDemo() {
  return <PaymentCard />;
}

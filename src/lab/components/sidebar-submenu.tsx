"use client";

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Pranav Patel's sidebar sub-menu (https://x.com/thatspranav): one
// section open at a time, its items hanging off a tree, and the branch to
// the item you're on drawn in the section's colour.

export type SubmenuSection = {
  title: string;
  // The section's hue. Any CSS colour, light-dark() included.
  tone: string;
  items: { label: string; icon: React.ReactNode }[];
};

type Spot = { section: number; item: number };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Opening and closing share one curve, so while one section folds as
// another unfolds the menu's total height holds still and nothing below
// it bobs.
const FOLD = { duration: 0.32, ease: EASE_OUT };
const OPEN = FOLD;
const CLOSE = FOLD;
const SLIDE = { type: "spring", visualDuration: 0.35, bounce: 0.12 } as const;
// A section title's height (h-11), which the bar steps by.
const TITLE = 44;

// Tree geometry, in px. Rows are a fixed height so the branches can be
// drawn as one path rather than measured.
const ROW = 38;
const TRUNK = 8;
// Where a branch's curve starts above the row's middle, and how far it
// reaches toward the icon.
const BEND = 7;
const REACH = 22;

// Held outside so the default never reads as a new value each render.
const FIRST: Spot = { section: 0, item: 0 };

const rowMiddle = (i: number) => i * ROW + ROW / 2;
const branch = (y: number) =>
  `M${TRUNK} ${y - BEND} Q${TRUNK} ${y} ${TRUNK + BEND} ${y} H${REACH}`;

export function SidebarSubmenu({
  sections,
  defaultActive = FIRST,
  onSelect,
  className,
}: {
  sections: SubmenuSection[];
  defaultActive?: Spot;
  onSelect?: (section: string, item: string) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const [own, setOwn] = useState<Spot>(defaultActive);
  // The index card clicks through on its own state.
  const [show, setShow] = useState<Spot>(defaultActive);
  const active = play ? show : own;

  const pick = (spot: Spot) => {
    setOwn(spot);
    const s = sections[spot.section];
    onSelect?.(s.title, s.items[spot.item].label);
  };

  // The card's show: someone working down the menu, one item a beat, then
  // on to the next section.
  useEffect(() => {
    if (!play) return;
    const timer = setInterval(() => {
      setShow(({ section, item }) =>
        item + 1 < sections[section].items.length
          ? { section, item: item + 1 }
          : { section: (section + 1) % sections.length, item: 0 },
      );
    }, 1000);
    return () => {
      clearInterval(timer);
      setShow(defaultActive);
    };
  }, [play, sections, defaultActive]);

  return (
    <nav
      aria-label="Workspace"
      className={cn(
        "w-[340px] max-w-full rounded-[28px] bg-background py-6 pr-6 pl-7 shadow-raised",
        className,
      )}
    >
      {/* The rail the section bar rides on. */}
      <div className="relative pl-5">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-px bg-border"
        />
        {/* With one section open, its title always settles at its index
              times the title height, so the bar slides straight there while
              the sections fold around it. Centred on the 1px rail. */}
        <motion.span
          aria-hidden
          className="absolute top-2.5 -left-px h-6 w-[3px] rounded-full"
          initial={false}
          animate={{ y: active.section * TITLE }}
          transition={reduceMotion ? { duration: 0 } : SLIDE}
          style={{ backgroundColor: sections[active.section].tone }}
        />
        {sections.map((section, s) => {
          const open = s === active.section;
          return (
            <div
              key={section.title}
              style={{ "--tone": section.tone } as React.CSSProperties}
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => !open && pick({ section: s, item: 0 })}
                className={cn(
                  "relative flex h-11 w-full items-center rounded-md text-left text-[17px] outline-hidden transition-[color] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
                  open
                    ? "font-medium text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {section.title}
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="items"
                    className="overflow-hidden"
                    initial={
                      reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
                    }
                    animate={{ height: "auto", opacity: 1, transition: OPEN }}
                    exit={
                      reduceMotion
                        ? { opacity: 0, transition: { duration: 0.1 } }
                        : { height: 0, opacity: 0, transition: CLOSE }
                    }
                  >
                    <Branches
                      items={section.items}
                      active={active.item}
                      reduceMotion={reduceMotion}
                      onPick={(item) => pick({ section: s, item })}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function Branches({
  items,
  active,
  reduceMotion,
  onPick,
}: {
  items: SubmenuSection["items"];
  active: number;
  reduceMotion: boolean;
  onPick: (item: number) => void;
}) {
  const last = items.length - 1;
  // The grey tree: a trunk down to the last item, a curved branch to each.
  const tree = [
    `M${TRUNK} 0 V${rowMiddle(last) - BEND}`,
    ...items.map((_, i) => branch(rowMiddle(i))),
  ].join(" ");

  // The coloured branch runs from the top of the trunk to the active item,
  // and follows it, so moving down the list stretches it rather than
  // redrawing it.
  const y = useMotionValue(rowMiddle(active));
  const lit = useTransform(
    y,
    (v) =>
      `M${TRUNK} 0 V${v - BEND} Q${TRUNK} ${v} ${TRUNK + BEND} ${v} H${REACH}`,
  );
  useEffect(() => {
    const target = rowMiddle(active);
    if (reduceMotion) y.jump(target);
    else animate(y, target, SLIDE);
  }, [active, reduceMotion, y]);

  return (
    <div className="relative pb-2">
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={REACH}
        height={items.length * ROW}
        fill="none"
        strokeWidth={1.25}
        strokeLinecap="round"
      >
        <path d={tree} className="stroke-border" />
        <motion.path
          d={lit}
          className="stroke-(--tone)"
          // Drawn down from the section title as the section opens.
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.08 }}
        />
      </svg>
      <ul>
        {items.map(({ label, icon }, i) => {
          const on = i === active;
          return (
            <motion.li
              key={label}
              // Items settle in one after another as the section opens.
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, y: -4, filter: "blur(4px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.28,
                ease: EASE_OUT,
                delay: 0.05 + i * 0.04,
              }}
            >
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => onPick(i)}
                className={cn(
                  "group/item flex h-[38px] w-full items-center gap-2.5 rounded-md pl-[30px] text-left text-[15px] outline-hidden transition-[color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground",
                  on
                    ? "font-medium text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-[17px] shrink-0 transition-[color] duration-200 ease-out",
                    on ? "text-(--tone)" : "text-muted",
                  )}
                >
                  {icon}
                </span>
                <span className="truncate">{label}</span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

const ICON = {
  viewBox: "0 0 16 16",
  className: "size-[17px]",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// Section hues are data: each keeps its own, a step lighter in dark mode so
// it holds the same contrast.
const SECTIONS: SubmenuSection[] = [
  {
    title: "Inbox",
    tone: "light-dark(oklch(0.64 0.18 45), oklch(0.74 0.15 50))",
    items: [
      {
        label: "Unread",
        icon: (
          <svg {...ICON}>
            <rect x="2" y="3.5" width="12" height="9" rx="1.75" />
            <path d="m2.5 4.5 5.5 4 5.5-4" />
          </svg>
        ),
      },
      {
        label: "Mentions",
        icon: (
          <svg {...ICON}>
            <circle cx="8" cy="8" r="2.5" />
            <path d="M10.5 8v1a1.75 1.75 0 0 0 3.5 0V8a6 6 0 1 0-2.5 4.9" />
          </svg>
        ),
      },
      {
        label: "Archived",
        icon: (
          <svg {...ICON}>
            <rect x="2" y="2.75" width="12" height="3.25" rx="1" />
            <path d="M3 6v6.25c0 .55.45 1 1 1h8c.55 0 1-.45 1-1V6M6.5 8.75h3" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Analytics",
    tone: "light-dark(oklch(0.55 0.18 260), oklch(0.72 0.14 255))",
    items: [
      {
        label: "Overview",
        icon: (
          <svg {...ICON}>
            <path d="m2 11 4-4 3 3 5-5.5" />
            <path d="M10.5 4.5H14V8" />
          </svg>
        ),
      },
      {
        label: "Audience",
        icon: (
          <svg {...ICON}>
            <circle cx="6" cy="5.5" r="2.25" />
            <path d="M2 13c.4-2.2 2-3.5 4-3.5s3.6 1.3 4 3.5" />
            <path d="M10.5 3.5a2.25 2.25 0 0 1 0 4.25M12 9.75c1.1.5 1.85 1.6 2 3.25" />
          </svg>
        ),
      },
      {
        label: "Reports",
        icon: (
          <svg {...ICON}>
            <path d="M4 1.75h5.25L12.5 5v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V2.75c0-.55.45-1 1-1Z" />
            <path d="M6 9.5v2M8.25 7.5v4M10.5 10v1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Automations",
    tone: "light-dark(oklch(0.55 0.2 300), oklch(0.72 0.15 300))",
    items: [
      {
        label: "Workflows",
        icon: (
          <svg {...ICON}>
            <circle cx="4" cy="4" r="1.75" />
            <circle cx="4" cy="12" r="1.75" />
            <circle cx="12" cy="8" r="1.75" />
            <path d="M4 5.75v4.5M5.75 4H8a2 2 0 0 1 2 2v.25" />
          </svg>
        ),
      },
      {
        label: "Triggers",
        icon: (
          <svg {...ICON}>
            <path d="M9 1.75 3.5 9H8l-1 5.25L12.5 7H8l1-5.25Z" />
          </svg>
        ),
      },
      {
        label: "History",
        icon: (
          <svg {...ICON}>
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.75V8l2.25 1.5" />
          </svg>
        ),
      },
    ],
  },
];

const MENTIONS: Spot = { section: 0, item: 1 };

export default function SidebarSubmenuDemo() {
  return <SidebarSubmenu sections={SECTIONS} defaultActive={MENTIONS} />;
}

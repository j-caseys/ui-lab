"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { usePreviewPlay } from "@/lab/preview-play";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// After Gustavo's sidebar active state (https://x.com/heyimgustavo): one dot
// travels to whatever you pick, taking on its section's colour on the way,
// the label steps aside for it, and the colour wipes across the label.

export type SidebarSection = {
  title: string;
  // The section's hue. Any CSS colour, light-dark() included.
  tone: string;
  icon: React.ReactNode;
  items: { label: string; isNew?: boolean }[];
};

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
// Quick enough to keep up with clicking down the list, soft enough that the
// dot is seen travelling rather than teleporting.
const TRAVEL = { type: "spring", visualDuration: 0.35, bounce: 0.15 } as const;
const DOT = 6;

export function SidebarHighlight({
  sections,
  defaultActive,
  onSelect,
  className,
}: {
  sections: SidebarSection[];
  defaultActive?: string;
  onSelect?: (label: string) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const play = usePreviewPlay();
  const [own, setOwn] = useState(
    defaultActive ?? sections[0]?.items[0]?.label,
  );
  // The index card clicks around on its own state.
  const [show, setShow] = useState(own);
  const active = play ? show : own;

  const listRef = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLButtonElement>());
  const y = useMotionValue(0);
  const placed = useRef(false);

  const tone = sections.find((s) => s.items.some((i) => i.label === active))
    ?.tone;

  // The dot lives in the list, not in an item, so it can travel between
  // them. It lines up with the middle of the active row.
  useLayoutEffect(() => {
    const place = (instant: boolean) => {
      const item = active ? items.current.get(active) : undefined;
      if (!item) return;
      const target = item.offsetTop + item.offsetHeight / 2 - DOT / 2;
      if (instant || reduceMotion) y.jump(target);
      else animate(y, target, TRAVEL);
    };
    place(!placed.current);
    placed.current = true;
    // Fonts landing or the width changing moves the rows; follow without
    // animating. An observer reports once as soon as it starts, which would
    // snap the dot mid-travel, so only a real change in size counts.
    const list = listRef.current;
    if (!list) return;
    let size = `${list.offsetWidth}x${list.offsetHeight}`;
    const observer = new ResizeObserver(() => {
      const next = `${list.offsetWidth}x${list.offsetHeight}`;
      if (next === size) return;
      size = next;
      place(true);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [active, reduceMotion, y]);

  // The card's show: someone reading down the list, picking a note now and
  // then.
  useEffect(() => {
    if (!play) return;
    const picks = ["Letter spacing", "Novelty budget", "Tabular numbers"];
    let i = 0;
    const timer = setInterval(() => {
      setShow(picks[i % picks.length]);
      i += 1;
    }, 1100);
    return () => {
      clearInterval(timer);
      setShow(own);
    };
  }, [play, own]);

  return (
    <nav
      aria-label="Notes"
      // Rows fade at the top and bottom edges, so the list reads as going on
      // rather than being cut off.
      className={cn(
        "h-[440px] w-[300px] max-w-full overflow-y-auto overscroll-contain rounded-3xl bg-background shadow-raised [mask-image:linear-gradient(to_bottom,transparent,black_36px,black_calc(100%-36px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <div ref={listRef} className="relative px-7 py-8">
        <motion.span
          aria-hidden
          className="absolute top-0 left-7 size-1.5 rounded-full transition-[background-color] duration-300 ease-out motion-reduce:transition-none"
          style={{ y, backgroundColor: tone }}
        />
        {sections.map((section) => (
          <section key={section.title} className="mt-7 first:mt-0">
            <h3
              className="mb-1.5 flex items-center gap-2.5 text-[15px] font-medium"
              style={{ "--tone": section.tone } as React.CSSProperties}
            >
              <span className="size-4 text-(--tone)">{section.icon}</span>
              {section.title}
            </h3>
            <ul>
              {section.items.map(({ label, isNew }) => {
                const on = label === active;
                return (
                  <li key={label}>
                    <button
                      ref={(el) => {
                        if (el) items.current.set(label, el);
                        else items.current.delete(label);
                      }}
                      type="button"
                      aria-current={on ? "true" : undefined}
                      onClick={() => {
                        setOwn(label);
                        onSelect?.(label);
                      }}
                      className="group/item flex h-8 w-full items-center rounded-md text-left text-[15px] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
                      style={{ "--tone": section.tone } as React.CSSProperties}
                    >
                      {/* Steps right to make room for the dot. */}
                      <span
                        className={cn(
                          "flex items-center gap-2 transition-[translate] duration-300 motion-reduce:transition-none",
                          on && "translate-x-3.5",
                        )}
                        style={{ transitionTimingFunction: EASE_OUT }}
                      >
                        <span className="relative whitespace-nowrap">
                          <span className="text-muted transition-[color] duration-150 ease-out group-hover/item:text-foreground">
                            {label}
                          </span>
                          {/* The section colour wipes in left to right on
                              a copy of the label laid over it, so the
                              hues never mix mid-way. */}
                          <span
                            aria-hidden
                            className="absolute inset-0 text-(--tone) transition-[clip-path] motion-reduce:transition-none"
                            style={{
                              clipPath: on ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                              transitionDuration: on ? "450ms" : "200ms",
                              transitionTimingFunction: EASE_OUT,
                            }}
                          >
                            {label}
                          </span>
                        </span>
                        {isNew && (
                          <span className="rounded-full bg-green-500/12 px-1.5 py-px text-[11px] font-medium text-green-700 ring-1 ring-green-500/25 ring-inset dark:text-green-400">
                            New
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

const ICON = {
  viewBox: "0 0 16 16",
  className: "size-4",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// Section hues are data: each section keeps its own, a step lighter in dark
// mode so it holds the same contrast.
const SECTIONS: SidebarSection[] = [
  {
    title: "Craft",
    tone: "light-dark(oklch(0.62 0.17 45), oklch(0.74 0.15 50))",
    icon: (
      <svg {...ICON}>
        <path d="M3 13l1.5-4.5L11 2l3 3-6.5 6.5L3 13Z" />
        <path d="M9.5 3.5l3 3" />
      </svg>
    ),
    items: [
      { label: "Taste is trained" },
      { label: "Novelty budget" },
      { label: "Details compound" },
    ],
  },
  {
    title: "Typography",
    tone: "light-dark(oklch(0.55 0.18 260), oklch(0.72 0.14 255))",
    icon: (
      <svg {...ICON}>
        <path d="M1.75 12.5 5 3.5l3.25 9M2.9 9.5h4.2" />
        <circle cx="11.75" cy="10.25" r="2.25" />
        <path d="M14 8v4.5" />
      </svg>
    ),
    items: [
      { label: "Letter spacing" },
      { label: "Text wrapping" },
      { label: "Tabular numbers", isNew: true },
      { label: "Optical sizes" },
    ],
  },
  {
    title: "Color",
    tone: "light-dark(oklch(0.58 0.2 10), oklch(0.72 0.16 10))",
    icon: (
      <svg {...ICON}>
        <circle cx="8" cy="5.25" r="2.5" />
        <circle cx="5" cy="10.5" r="2.5" />
        <circle cx="11" cy="10.5" r="2.5" />
      </svg>
    ),
    items: [
      { label: "OKLCH" },
      { label: "Grain", isNew: true },
      { label: "Shadows over borders" },
      { label: "Image outlines" },
    ],
  },
  {
    title: "Layout",
    tone: "light-dark(oklch(0.66 0.16 70), oklch(0.78 0.14 75))",
    icon: (
      <svg {...ICON}>
        <rect x="2.25" y="3" width="11.5" height="10" rx="1.75" />
        <path d="M6.5 3v10M6.5 7h7.25" />
      </svg>
    ),
    items: [
      { label: "Concentric radii", isNew: true },
      { label: "Hit areas" },
      { label: "Clip paths" },
      { label: "Scroll fades" },
    ],
  },
  {
    title: "Motion",
    tone: "light-dark(oklch(0.55 0.2 300), oklch(0.72 0.15 300))",
    icon: (
      <svg {...ICON}>
        <path d="M3 12.5C7 12.5 8 3.5 13 3.5" />
        <circle cx="3" cy="12.5" r="1.25" />
        <circle cx="13" cy="3.5" r="1.25" />
      </svg>
    ),
    items: [
      { label: "Icon morphs" },
      { label: "Button press" },
      { label: "Easing curves" },
      { label: "Stagger" },
      { label: "Interruptibility" },
    ],
  },
];

export default function SidebarHighlightDemo() {
  return <SidebarHighlight sections={SECTIONS} defaultActive="Tabular numbers" />;
}

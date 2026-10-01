"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/cn";

// One line to take an experiment home: the shadcn CLI pulls the file from
// /r/<slug>.json into your project. The package manager you pick is
// remembered, so every page after speaks your dialect.

const RUNNERS = {
  npm: "npx shadcn@latest add",
  pnpm: "pnpm dlx shadcn@latest add",
  yarn: "yarn dlx shadcn@latest add",
  bun: "bunx --bun shadcn@latest add",
} as const;
type Runner = keyof typeof RUNNERS;
const NAMES = Object.keys(RUNNERS) as Runner[];

const STORAGE_KEY = "lab-runner";
const CHANGED = "lab-runner-changed";

function readRunner(): Runner {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && saved in RUNNERS ? (saved as Runner) : "npm";
  } catch {
    return "npm";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function saveRunner(runner: Runner) {
  try {
    localStorage.setItem(STORAGE_KEY, runner);
  } catch {}
  window.dispatchEvent(new Event(CHANGED));
}

const ICON = {
  initial: { opacity: 0, scale: 0.5, filter: "blur(2px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.5, filter: "blur(2px)" },
};

export function InstallCommand({ url }: { url: string }) {
  const reduceMotion = useReducedMotion();
  // npm on the server and during hydration, the saved choice right after.
  const runner = useSyncExternalStore<Runner>(subscribe, readRunner, () => "npm");
  const command = `${RUNNERS[runner]} ${url}`;
  const [copied, setCopied] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(reset.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section
      aria-labelledby="install-heading"
      className="rounded-2xl border border-border bg-surface/60 p-1.5"
    >
      <div className="flex items-center justify-between gap-3 py-1 pr-1 pl-3">
        <h2 id="install-heading" className="text-[13px] font-medium">
          Install
        </h2>
        <div
          role="radiogroup"
          aria-label="Package manager"
          className="flex items-center gap-0.5"
        >
          {NAMES.map((name) => {
            const active = name === runner;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => saveRunner(name)}
                className={cn(
                  "relative h-7 rounded-full px-2.5 font-mono text-xs outline-hidden transition-[color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground",
                  active ? "text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="install-runner"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-background shadow-raised"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", visualDuration: 0.25, bounce: 0.15 }
                    }
                  />
                )}
                <span className="relative">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1 rounded-xl bg-background p-1 pl-3.5 shadow-raised">
        {/* Long URLs scroll sideways inside the box rather than wrapping,
            and fade at the edge so a cut-off reads as "more this way". */}
        <code className="min-w-0 flex-1 overflow-x-auto py-2 font-mono text-[13px] whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span aria-hidden className="text-muted select-none">
            ${" "}
          </span>
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy install command"}
          className="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted outline-hidden transition-[color,background-color,scale] duration-150 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.92]"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.svg
              key={copied ? "check" : "copy"}
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              {...(reduceMotion ? {} : ICON)}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            >
              {copied ? (
                <path d="m3.5 8.5 3 3 6-7" />
              ) : (
                <>
                  <rect x="5.25" y="5.25" width="8" height="8" rx="2" />
                  <path d="M10.75 3.25a2 2 0 0 0-2-1h-4.5a2 2 0 0 0-2 2v4.5a2 2 0 0 0 1 2" />
                </>
              )}
            </motion.svg>
          </AnimatePresence>
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? "Install command copied" : ""}
      </p>
    </section>
  );
}

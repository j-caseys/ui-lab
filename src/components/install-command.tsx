"use client";

import { useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { CopyButton } from "@/lab/components/copy-button";
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

export function InstallCommand({ url }: { url: string }) {
  const reduceMotion = useReducedMotion();
  // npm on the server and during hydration, the saved choice right after.
  const runner = useSyncExternalStore<Runner>(subscribe, readRunner, () => "npm");
  const command = `${RUNNERS[runner]} ${url}`;

  return (
    <section aria-labelledby="install-heading">
      <div className="flex items-center justify-between gap-3 pl-1">
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
      {/* The lab's own copy button, in the pill it was made for. 44px with
          6px around the 32px button keeps the radii concentric. */}
      <div className="mt-1.5 flex h-11 items-center gap-2 rounded-full bg-surface pr-1.5 pl-4 shadow-raised">
        {/* Long URLs scroll sideways inside the pill rather than wrapping,
            and fade at the edge so a cut-off reads as "more this way". */}
        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[13px] whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span aria-hidden className="text-muted select-none">
            ${" "}
          </span>
          {command}
        </code>
        <CopyButton value={command} label="Copy install command" className="shrink-0" />
      </div>
    </section>
  );
}

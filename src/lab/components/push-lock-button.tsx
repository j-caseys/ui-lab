"use client";

import { useEffect, useState } from "react";
import { usePreviewPlay } from "@/lab/preview-play";
import { cn } from "@/lib/cn";

// After Petr Knoll's skeuomorphic CSS button (https://x.com/iampetrknoll):
// a plastic cap made only of gradients and shadows. Here it's a push-lock
// switch, the kind on old hi-fi gear: held, it bottoms out; let go, it
// catches halfway and the lamp comes on; press again and it springs back.

type Depth = "up" | "latched" | "down";

// The plastic and its panel are materials, not theme colours: pale grey
// in light mode, graphite in dark.
const MATERIAL = {
  "--plate": "light-dark(#e3e3e5, #222224)",
  "--cap-top": "light-dark(#f8f8f9, #4b4b4e)",
  "--cap-bottom": "light-dark(#d2d2d5, #2c2c2f)",
  "--ink": "light-dark(#232325, #e9e9ea)",
  "--lip": "light-dark(rgb(255 255 255 / 0.95), rgb(255 255 255 / 0.14))",
  "--well-top": "light-dark(#a9a9ad, #0d0d0e)",
  "--well-bottom": "light-dark(#d9d9dc, #303033)",
} as React.CSSProperties;

// Every depth lists the same five shadows, so the browser can blend
// between them instead of snapping: top lip, inner shading, contact,
// near shadow, far shadow.
const CAP: Record<Depth, { transform: string; boxShadow: string }> = {
  up: {
    transform: "translateY(0) scale(1)",
    boxShadow:
      "inset 0 1px 0 var(--lip), inset 0 -3px 6px rgb(0 0 0 / 0.07), 0 1px 1px rgb(0 0 0 / 0.14), 0 4px 8px -2px rgb(0 0 0 / 0.2), 0 14px 22px -10px rgb(0 0 0 / 0.32)",
  },
  latched: {
    transform: "translateY(1px) scale(0.985)",
    boxShadow:
      "inset 0 1px 0 var(--lip), inset 0 -2px 4px rgb(0 0 0 / 0.06), 0 1px 1px rgb(0 0 0 / 0.18), 0 2px 3px -1px rgb(0 0 0 / 0.16), 0 4px 8px -6px rgb(0 0 0 / 0.2)",
  },
  down: {
    transform: "translateY(2px) scale(0.97)",
    boxShadow:
      "inset 0 0 0 transparent, inset 0 2px 5px rgb(0 0 0 / 0.16), 0 0 0 transparent, 0 0 0 transparent, 0 0 0 transparent",
  },
};
// How much of the dark recess around the cap shows as it sinks.
const WELL: Record<Depth, number> = { up: 0, latched: 0.75, down: 1 };
// Pressing bottoms out at once; coming back up has a little give.
const SINK = "90ms cubic-bezier(0.23, 1, 0.32, 1)";
const RISE = "260ms cubic-bezier(0.34, 1.4, 0.64, 1)";

// The switch's sounds, made on the spot rather than loaded: a burst of
// noise through a narrow filter is the plastic edge, a short falling sine
// under it is the body. One context for the page, opened on the first press
// so the browser allows it.
let audio: AudioContext | null = null;

type Click = {
  // Where the plastic rings: higher is a sharper, smaller part.
  pitch: number;
  ring: number;
  // The thump of the body under it.
  body: number;
  weight: number;
  length: number;
};

const SOUNDS = {
  // Bottoming out: a full clack with some weight.
  press: { pitch: 1900, ring: 1.4, body: 150, weight: 0.22, length: 0.03 },
  // The latch catching: small and bright.
  latch: { pitch: 3300, ring: 2.2, body: 220, weight: 0.08, length: 0.018 },
  // Springing back up: lower and hollow.
  release: { pitch: 1250, ring: 1, body: 115, weight: 0.24, length: 0.045 },
} satisfies Record<string, Click>;

// Kept low on purpose: it's a detail, and someone may have earbuds in.
const VOLUME = 0.35;

function playClick({ pitch, ring, body, weight, length }: Click) {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const a = audio;
    const t = a.currentTime;
    const out = a.createGain();
    out.gain.value = VOLUME;
    out.connect(a.destination);

    // Noise that dies away fast; a little different every press, the way
    // no two real clicks match.
    const frames = Math.ceil(a.sampleRate * length);
    const buffer = a.createBuffer(1, frames, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
    }
    const noise = a.createBufferSource();
    noise.buffer = buffer;
    const band = a.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = pitch * (0.94 + Math.random() * 0.12);
    band.Q.value = ring;
    noise.connect(band).connect(out);
    noise.start(t);

    const thump = a.createOscillator();
    thump.frequency.setValueAtTime(body, t);
    thump.frequency.exponentialRampToValueAtTime(body * 0.45, t + 0.05);
    const fall = a.createGain();
    fall.gain.setValueAtTime(weight, t);
    fall.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    thump.connect(fall).connect(out);
    thump.start(t);
    thump.stop(t + 0.07);
  } catch {
    // No audio (blocked, or an old browser): the switch works silently.
  }
}

export function PushLockButton({
  label = "Push",
  lamp = "Power",
  defaultOn = false,
  sound = true,
  onChange,
  className,
}: {
  label?: string;
  lamp?: string;
  defaultOn?: boolean;
  // Clicks when pressed. Only ever from a real press, never on its own.
  sound?: boolean;
  onChange?: (on: boolean) => void;
  className?: string;
}) {
  const play = usePreviewPlay();
  const [held, setHeld] = useState(false);
  const [on, setOn] = useState(defaultOn);
  // The index card works the switch on its own state.
  const [showHeld, setShowHeld] = useState(false);
  const [showOn, setShowOn] = useState(false);
  const isHeld = play ? showHeld : held;
  const isOn = play ? showOn : on;
  const depth: Depth = isHeld ? "down" : isOn ? "latched" : "up";
  const motion = isHeld ? SINK : RISE;

  // The card's show: switched on, left a moment, switched off.
  useEffect(() => {
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const press = (at: number, to: boolean) => {
      timers.push(setTimeout(() => setShowHeld(true), at));
      timers.push(
        setTimeout(() => {
          setShowHeld(false);
          setShowOn(to);
        }, at + 220),
      );
    };
    const loop = () => {
      press(500, true);
      press(2100, false);
      timers.push(setTimeout(loop, 3300));
    };
    loop();
    return () => {
      timers.forEach(clearTimeout);
      setShowHeld(false);
      setShowOn(false);
    };
  }, [play]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    onChange?.(next);
    if (sound) playClick(next ? SOUNDS.latch : SOUNDS.release);
  };
  const press = () => {
    setHeld(true);
    if (sound) playClick(SOUNDS.press);
  };
  const isKey = (key: string) => key === " " || key === "Enter";

  return (
    <div
      className={cn(
        "relative flex h-[180px] w-[300px] max-w-full items-center justify-center rounded-[30px] bg-(--plate) shadow-[inset_0_1px_0_var(--lip),0_1px_2px_rgb(0_0_0/0.08),0_10px_30px_-12px_rgb(0_0_0/0.25)] select-none",
        className,
      )}
      style={MATERIAL}
    >
      {/* Engraved into the panel, with the lamp beside it. */}
      <span className="absolute top-5 left-6 flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-(--ink) uppercase opacity-45">
        {lamp}
      </span>
      <span
        aria-hidden
        className="absolute top-[22px] right-6 size-2 rounded-full transition-[background-color,box-shadow] duration-150 ease-out"
        style={{
          // Lights as the latch catches, not the instant it's pressed.
          transitionDelay: isOn && !isHeld ? "60ms" : "0ms",
          backgroundColor: isOn ? "#ffae2b" : "light-dark(#bdbdc0, #3a3a3d)",
          boxShadow: isOn
            ? "0 0 0 1px rgb(255 140 0 / 0.5), 0 0 10px 2px rgb(255 168 40 / 0.55)"
            : "inset 0 1px 1px rgb(0 0 0 / 0.25)",
        }}
      />

      <span className="relative">
        {/* The hole in the panel the cap sits in. Hidden under the cap's
            own shadow at rest; its dark rim shows as the cap goes down. */}
        <span
          aria-hidden
          className="absolute -inset-1 rounded-full"
          style={{
            background: "linear-gradient(180deg, var(--well-top), var(--well-bottom))",
            boxShadow: "inset 0 2px 4px rgb(0 0 0 / 0.45), 0 1px 0 var(--lip)",
            opacity: WELL[depth],
            transition: `opacity ${motion}`,
          }}
        />
        <button
          type="button"
          aria-pressed={isOn}
          onClick={toggle}
          onPointerDown={(e) => e.button === 0 && press()}
          onPointerUp={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          onPointerCancel={() => setHeld(false)}
          onKeyDown={(e) => isKey(e.key) && !e.repeat && press()}
          onKeyUp={(e) => isKey(e.key) && setHeld(false)}
          onBlur={() => setHeld(false)}
          className="relative flex h-[68px] w-[168px] touch-manipulation items-center justify-center rounded-full text-[20px] font-medium tracking-[-0.01em] text-(--ink) outline-hidden [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[6px] focus-visible:outline-foreground"
          style={{
            backgroundImage: "linear-gradient(180deg, var(--cap-top), var(--cap-bottom))",
            ...CAP[depth],
            transition: `transform ${motion}, box-shadow ${motion}`,
          }}
        >
          {/* Pressed in, the face loses its dome and catches less light. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-black"
            style={{
              opacity: depth === "down" ? 0.05 : depth === "latched" ? 0.025 : 0,
              transition: `opacity ${motion}`,
            }}
          />
          <span
            className="relative"
            // Moulded into the plastic: a light edge under the letters.
            style={{ textShadow: "0 1px 0 var(--lip)" }}
          >
            {label}
          </span>
        </button>
      </span>
    </div>
  );
}

export default function PushLockButtonDemo() {
  return <PushLockButton />;
}

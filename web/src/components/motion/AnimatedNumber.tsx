"use client";

/**
 * AnimatedNumber (CR-003): counts the first number inside a formatted string up to its value, keeping the
 * prefix, suffix, separators and decimals ("AED 2.14 M", "94,867 units", "97.7%"). When the value changes
 * (for example a new scenario), it counts from the old value to the new one.
 *
 * Screen readers get the final text at once (sr-only); the moving digits are aria-hidden.
 * Under prefers-reduced-motion the final value is shown immediately. The tween is a few lines of
 * requestAnimationFrame rather than motion's `animate`, which would add its engine to the initial bundle.
 */
import { inView } from "motion";
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./reducedMotion";

const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

function parts(text: string) {
  const match = NUMBER.exec(text);
  if (!match) return null;
  const raw = match[0];
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return {
    before: text.slice(0, match.index),
    after: text.slice(match.index + raw.length),
    value: Number(raw.replace(/,/g, "")),
    decimals,
    grouped: raw.includes(","),
  };
}

/** easeOutExpo-like curve, matching the app's --ease-out. */
const ease = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

function tween(from: number, to: number, seconds: number, onUpdate: (v: number) => void, onDone: () => void) {
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / (seconds * 1000));
    onUpdate(from + (to - from) * ease(t));
    if (t < 1) frame = requestAnimationFrame(step);
    else onDone();
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

function format(value: number, decimals: number, grouped: boolean) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouped,
  });
}

export function AnimatedNumber({ text, className, duration = 1.1 }: { text: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  const reduce = useReducedMotion();
  const parsed = parts(text);
  const target = parsed?.value ?? 0;
  // The number currently on screen. It starts at 0 and only frame callbacks move it (never the effect body).
  const [value, setValue] = useState(0);
  const live = useRef(0);

  // Motion's inView: start counting the first time at least 40% of the number is on screen.
  useEffect(() => {
    if (!ref.current) return;
    return inView(ref.current, () => {
      setSeen(true);
    }, { amount: 0.4 });
  }, []);

  useEffect(() => {
    if (reduce || !seen || !Number.isFinite(target)) return;
    const update = (v: number) => {
      live.current = v;
      setValue(v);
    };
    return tween(live.current, target, duration, update, () => update(target));
  }, [target, seen, reduce, duration]);

  const shown = !parsed || reduce ? text : `${parsed.before}${format(value, parsed.decimals, parsed.grouped)}${parsed.after}`;
  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

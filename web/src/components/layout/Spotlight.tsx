"use client";

/**
 * Spotlight (CR-003): one passive pointer listener for the whole app. It writes the cursor position, relative
 * to the glass panel under the pointer, into that panel's --mx / --my custom properties. CSS turns them into
 * a soft interior glow and a brighter rim (globals.css, "Glass"). Throttled to one update per frame.
 * Skipped on touch-only devices, where there is no hover.
 */
import { useEffect } from "react";

const TARGET = ".glass-panel, .glow-target";

export function Spotlight() {
  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    let frame = 0;
    let last: HTMLElement | null = null;
    let event: PointerEvent | null = null;

    const apply = () => {
      frame = 0;
      if (!event) return;
      const el = (event.target instanceof Element ? event.target.closest(TARGET) : null) as HTMLElement | null;
      if (last && last !== el) last.removeAttribute("data-lit");
      if (el) {
        const box = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${event.clientX - box.left}px`);
        el.style.setProperty("--my", `${event.clientY - box.top}px`);
        el.setAttribute("data-lit", "");
      }
      last = el;
    };
    const onMove = (e: PointerEvent) => {
      event = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      last?.removeAttribute("data-lit");
      last = null;
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return null;
}

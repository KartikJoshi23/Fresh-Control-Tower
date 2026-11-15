"use client";

/**
 * Glide (CR-003): a highlight that springs between the items of a group (nav links, tabs).
 *
 * It measures the active item (the first match of `selector`) relative to the container, in a
 * ResizeObserver callback, so it also follows resizes and font loading. The indicator moves with a CSS
 * transition on a spring curve (globals.css, .nav-active / .tab-indicator): GPU-friendly and almost no
 * JavaScript, which keeps every route inside the 300 KB initial-JS budget.
 * Until the first measurement the container has no `data-glide` attribute, and CSS highlights the active
 * item directly (the pre-rendered HTML and no-JavaScript views still show the current page).
 */
import { type DependencyList, useEffect, useRef, useState } from "react";

export interface GlideBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useGlide<T extends HTMLElement>(selector: string, deps: DependencyList) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<GlideBox | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const active = container.querySelector<HTMLElement>(selector);
      if (!active) return setBox(null);
      const c = container.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      setBox({ x: a.left - c.left, y: a.top - c.top, width: a.width, height: a.height });
    });
    ro.observe(container);
    const active = container.querySelector<HTMLElement>(selector);
    if (active) ro.observe(active);
    return () => ro.disconnect();
    // The caller passes what changes the active item (for example the pathname or the selected tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return [ref, box] as const;
}

/** The moving highlight. Render it inside the measured container (position: relative). */
export function GlideIndicator({ box, className }: { box: GlideBox | null; className: string }) {
  return (
    <span aria-hidden="true" className={className}
      style={box ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.width, height: box.height, opacity: 1 } : { opacity: 0 }} />
  );
}

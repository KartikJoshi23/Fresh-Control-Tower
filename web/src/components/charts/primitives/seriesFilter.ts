"use client";

/**
 * Show/hide filter for the lines in a chart (team request, 15 Nov 2026). The legend becomes a row of buttons:
 * - with every line showing, clicking a name shows ONLY that line;
 * - after that, clicking other names adds or removes them (several can be shown);
 * - "Show all" brings every line back, and removing the last visible line also shows all (never an empty chart).
 * Colours never change when lines are hidden (design system §4.2: colour follows the entity).
 */
import { useCallback, useState } from "react";

export interface SeriesFilter {
  /** Is this series id currently visible? */
  isShown: (id: string) => boolean;
  /** Click on a legend name. `allIds` are every filterable id in the chart. */
  toggle: (id: string, allIds: string[]) => void;
  showAll: () => void;
  /** True when some lines are hidden. */
  filtering: boolean;
}

/** Pure state step, exported for tests: null means "all shown". */
export function nextShown(shown: string[] | null, id: string, allIds: string[]): string[] | null {
  if (shown === null) return allIds.length > 1 ? [id] : null;
  if (shown.includes(id)) {
    const next = shown.filter((x) => x !== id);
    return next.length ? next : null;
  }
  const next = [...shown, id];
  return allIds.every((x) => next.includes(x)) ? null : next;
}

export function useSeriesFilter(): SeriesFilter {
  const [shown, setShown] = useState<string[] | null>(null);
  const toggle = useCallback((id: string, allIds: string[]) => setShown((s) => nextShown(s, id, allIds)), []);
  return {
    isShown: (id) => shown === null || shown.includes(id),
    toggle,
    showAll: () => setShown(null),
    filtering: shown !== null,
  };
}

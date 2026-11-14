"use client";

/** The scenario's date window, resolved through backtest.json's windows (the single list of stress windows). */
import { useArtefact } from "@/lib/data/hooks";
import { useScenario } from "@/lib/state/scenarioStore";
import { WINDOW_LABELS } from "@/lib/state/scenario";

export interface DateWindow {
  id: string;
  label: string;
  start: string;
  end: string;
}

const FALLBACK: DateWindow = { id: "test-2026", label: WINDOW_LABELS["test-2026"], start: "2026-01-01", end: "2026-10-31" };

export function useDateWindow(): DateWindow {
  const id = useScenario().selection.window;
  const backtest = useArtefact("backtest.json");
  if (backtest.status !== "ok") return { ...FALLBACK, id, label: WINDOW_LABELS[id] };
  const w = backtest.data.windows.find((x) => x.id === id) ?? backtest.data.windows[0];
  return { id: w.id, label: w.label, start: w.range.start, end: w.range.end };
}

/** Rows of a daily series inside [start, end] (inclusive, ISO date strings compare correctly). */
export function inWindow<T extends { date: string }>(rows: T[], w: { start: string; end: string }): T[] {
  return rows.filter((r) => r.date >= w.start && r.date <= w.end);
}

"use client";

/**
 * The single shared scenario store (Zustand), read by every page (implementation-plan.md §2.5).
 * The URL mirror lives in components/layout/ScenarioUrlSync.tsx; the rules are in ./scenario.ts.
 * New fields need a change request (plan §10.2: scenarioStore.ts is owned by Part 5).
 */
import { create } from "zustand";

import { DEFAULT_SCENARIO, PRESETS, type ScenarioState, setPath } from "./scenario";

interface ScenarioStore {
  scenario: ScenarioState;
  /** Set one field by dotted path, for example set("spike.magnitude", 3). */
  set: (path: string, value: unknown) => void;
  applyPreset: (id: string) => void;
  replace: (scenario: ScenarioState) => void;
  reset: () => void;
  consoleOpen: boolean;
  setConsoleOpen: (open: boolean) => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  scenario: DEFAULT_SCENARIO,
  set: (path, value) => set((s) => ({ scenario: setPath(s.scenario, path, value) })),
  applyPreset: (id) =>
    set((s) => {
      const preset = PRESETS.find((p) => p.id === id);
      return preset ? { scenario: preset.apply(s.scenario) } : s;
    }),
  replace: (scenario) => set({ scenario }),
  reset: () =>
    set((s) => ({
      scenario: { ...DEFAULT_SCENARIO, selection: { ...s.scenario.selection, window: DEFAULT_SCENARIO.selection.window } },
    })),
  consoleOpen: false,
  setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
}));

/** Read the whole scenario (re-renders on any change). */
export function useScenario(): ScenarioState {
  return useScenarioStore((s) => s.scenario);
}

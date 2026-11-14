"use client";

/**
 * Mirrors the scenario store into the URL query string (requirement R5: scenarios can be shared as links).
 *
 * - On first load, and on back/forward (popstate), the URL is decoded into the store.
 * - On every store change, the URL is updated with history.replaceState, which Next.js integrates with
 *   its router (node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md).
 * It reads window.location inside effects rather than useSearchParams, so nothing above it bails out of
 * prerendering, and the static export needs no Suspense boundary for it.
 */
import { useEffect } from "react";

import { decodeScenario, encodeScenario } from "@/lib/state/scenario";
import { useScenarioStore } from "@/lib/state/scenarioStore";

export function ScenarioUrlSync() {
  useEffect(() => {
    const store = useScenarioStore.getState();
    const fromUrl = () => {
      const decoded = decodeScenario(window.location.search);
      store.replace({ ...decoded, ui: { ...decoded.ui, liveSpeed: useScenarioStore.getState().scenario.ui.liveSpeed } });
    };
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    const unsubscribe = useScenarioStore.subscribe((state, previous) => {
      if (state.scenario === previous.scenario) return;
      const query = encodeScenario(state.scenario);
      const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(window.history.state, "", next);
      }
    });
    return () => {
      window.removeEventListener("popstate", fromUrl);
      unsubscribe();
    };
  }, []);
  return null;
}

/**
 * Plain-language names for the ordering policies and simulation ranges (team decision, 15 Nov 2026): no codes
 * such as P0–P3 or P10/P50/P90 on screen. The codes stay in the data files and the report; this is the only
 * place that maps them to words.
 */
import type { PolicyId } from "@/lib/state/scenario";

export const POLICY_NAME: Record<PolicyId, string> = {
  P0: "Current method",
  P1: "AI daily ordering",
  P2: "AI + midday top-up",
  P3: "AI + top-up + best supplier",
};

/** One sentence each, for tooltips, selects and the KPI tables. */
export const POLICY_HELP: Record<PolicyId, string> = {
  P0: "Today's rule: order what sold over the last four weeks, plus 20% extra.",
  P1: "The AI places one order a day, based on its demand forecast and each item's shelf life.",
  P2: "As AI daily ordering, plus a same-day top-up at noon when the morning's sales show the shelf will run out.",
  P3: "As AI + midday top-up, plus choosing the best supplier for each order when routes are disrupted.",
};

export const policyName = (id: string) => POLICY_NAME[id as PolicyId] ?? id;

/** Simulation results are described as the "typical result" (the middle run) and the "likely range" (8 in 10 runs). */
export const likelyRange = (lo: string, hi: string) => `Likely range ${lo} to ${hi}`;

/** The stock-level setting (the service target τ in the methods): how much safety stock the AI keeps. */
export const serviceTargetLabel = (tau: number) => `Stock-level setting ${Math.round(tau * 100)}%`;

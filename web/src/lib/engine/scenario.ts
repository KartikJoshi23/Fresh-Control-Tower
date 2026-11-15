/**
 * Maps the shared scenario (lib/state/scenario.ts) onto the engine's inputs for one hero series.
 * - demand: the multiplier, and "orders per day" as an absolute level (÷ the mean P50 of the horizon);
 *   a heatwave applies the REAL FreshRetailNet-LT temperature effect (×1.0139 per °C, calibration.json);
 * - spike: its date relative to the planning start; warning days decide when the AI can plan for it;
 * - supply: under the Hormuz preset, sea suppliers' lead times scale by the sea lead-time multiplier;
 * - policy: P0 is the legacy rule; P1–P3 run the AI rule (the engine has one store-SKU and no intraday step,
 *   so P2/P3's extra levers show in the precomputed backtests, not here).
 */
import { daysBetween } from "@/lib/format";
import type { ScenarioState } from "@/lib/state/scenario";

import type { EngineParams, EngineScenario } from "./engine";

export const PER_DEGREE_C = 1.0139;

export function demandMultiplier(s: ScenarioState, engine: EngineParams): number {
  const meanP50 = engine.horizonQuantiles.reduce((a, q) => a + q.p50, 0) / engine.horizonQuantiles.length;
  const level = s.demand.ordersPerDay !== null && meanP50 > 0 ? s.demand.ordersPerDay / meanP50 : 1;
  const heat = s.weather.heatwave ? PER_DEGREE_C ** s.weather.heatwaveDeltaC : 1;
  return s.demand.demandMultiplier * level * heat;
}

export function spikeOf(s: ScenarioState, engine: EngineParams): EngineScenario["spike"] {
  if (!s.spike.enabled) return null;
  const h = engine.horizonQuantiles.length;
  const start = Math.min(h - 1, Math.max(0, daysBetween(engine.planningStart, s.spike.date)));
  return { startDay: start, days: s.spike.durationDays, magnitude: s.spike.magnitude, warningDays: s.spike.warningDays };
}

export function leadTimeMultiplier(s: ScenarioState, engine: EngineParams, supplierIndex = 0): number {
  const id = engine.leadTimes[supplierIndex]?.supplierId ?? "";
  return s.supply.disruptionPreset === "hormuz2026" && id.includes("sea") ? s.supply.seaLeadTimeMultiplier : 1;
}

export function toEngineScenario(s: ScenarioState, engine: EngineParams, override: Partial<EngineScenario> = {}): EngineScenario {
  const supplierIndex = override.supplierIndex ?? 0;
  const manual = s.policy.manualOrderDay !== null && s.policy.manualOrderQty !== null
    ? { day: s.policy.manualOrderDay, qty: s.policy.manualOrderQty } : null;
  return {
    demandMultiplier: demandMultiplier(s, engine),
    spike: spikeOf(s, engine),
    policy: s.policy.policy === "P0" ? "P0" : "AI",
    tau: s.policy.serviceTarget,
    supplierIndex,
    leadTimeMultiplier: leadTimeMultiplier(s, engine, supplierIndex),
    manualOrder: manual,
    ...override,
  };
}

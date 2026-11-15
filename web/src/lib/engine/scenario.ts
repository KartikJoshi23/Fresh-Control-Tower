/**
 * Maps the shared scenario (lib/state/scenario.ts) onto the engine's inputs for one hero series.
 * - demand: the multiplier, and "orders per day" as an absolute level (÷ the mean P50 of the horizon);
 *   a heatwave applies the REAL FreshRetailNet-LT temperature effect (×1.0139 per °C, calibration.json);
 * - Ramadan effect: scales this item's own Ramadan lift, measured on its Ramadan 2025 history (recovered demand vs the
 *   four weeks before) and applied to the horizon days that calendar.json marks as Ramadan (100% = as in the forecast);
 * - spike: its date relative to the planning start; warning days decide when the AI can plan for it;
 * - supply: sea suppliers' lead times scale by the sea delivery-time multiplier; "import deliveries a day late"
 *   delays that share of orders from sea and air importers (the suppliers the Hormuz disruption hits in the backtest);
 * - learning from till sales only (demand recovery off) scales the AI's forecast by the bias the ablation measured
 *   when the model is trained on recorded sales instead of recovered demand (ablation.json);
 * - policy: P0 is the legacy rule; P1–P3 run the AI rule (the engine has one store-SKU and no intraday step,
 *   so P2/P3's extra levers show in the precomputed backtests, not here).
 */
import type { AblationFile, CalendarFile, SeriesFile } from "@/lib/contracts";
import { daysBetween } from "@/lib/format";
import type { ScenarioState } from "@/lib/state/scenario";

import type { EngineParams, EngineScenario } from "./engine";

export const PER_DEGREE_C = 1.0139;

/** Inputs some levers need beyond the engine block: computed once per series (see `engineContext`). */
export interface EngineContext {
  /** True for each horizon day that calendar.json marks as Ramadan (its build-up week included). */
  ramadanDays: boolean[];
  /** This item's Ramadan lift (0.4 = 40% more demand), or null when its history cannot measure one. */
  ramadanLift: number | null;
  /** Forecast multiplier when the AI learns from till sales only: (1 + bias on recorded sales) ÷ (1 + bias on recovered demand). */
  censoredForecastFactor: number;
}

const isRamadanDay = (d: CalendarFile["days"][number]) =>
  d.festivalId !== null && d.festivalId.startsWith("ramadan-") && (d.festivalPhase === "pre" || d.festivalPhase === "during");

/** The item's Ramadan lift in `year`: mean recovered demand (the AI's view of demand) over Ramadan and its build-up week,
 *  divided by the mean over the 28 days before, minus 1. */
export function ramadanLift(rows: SeriesFile["rows"], days: CalendarFile["days"], year = 2025): number | null {
  const season = new Set(days.filter((d) => d.festivalId === `ramadan-${year}` && isRamadanDay(d)).map((d) => d.date));
  const first = [...season].sort()[0];
  if (!first) return null;
  let seasonSum = 0, seasonN = 0, baseSum = 0, baseN = 0;
  for (const r of rows) {
    if (r.recoveredDemand === null) continue;
    if (season.has(r.date)) { seasonSum += r.recoveredDemand; seasonN += 1; }
    else if (r.date < first && daysBetween(r.date, first) <= 28) { baseSum += r.recoveredDemand; baseN += 1; }
  }
  if (seasonN === 0 || baseN === 0 || baseSum <= 0) return null;
  return seasonSum / seasonN / (baseSum / baseN) - 1;
}

export function engineContext(series: SeriesFile, calendar: CalendarFile, ablation: AblationFile): EngineContext {
  const byDate = new Map(calendar.days.map((d) => [d.date, d]));
  const ramadanDays = series.engine.horizonQuantiles.map((q) => {
    const d = byDate.get(q.date);
    return d !== undefined && isRamadanDay(d);
  });
  const recorded = ablation.groups.find((g) => g.id === "stock-status");
  const censoredForecastFactor = recorded ? (1 + recorded.wpe) / (1 + ablation.full.wpe) : 1;
  return { ramadanDays, ramadanLift: ramadanLift(series.rows, calendar.days), censoredForecastFactor };
}

/** Per-day demand factors for the Ramadan effect: (1 + lift × intensity) ÷ (1 + lift) on Ramadan days; null when neutral. */
export function ramadanDayFactors(intensityPct: number, ctx: EngineContext | null): number[] | null {
  const lift = ctx?.ramadanLift ?? null;
  if (ctx === null || lift === null || intensityPct === 100 || !ctx.ramadanDays.some(Boolean) || 1 + lift <= 0) return null;
  const factor = Math.max(0, 1 + lift * (intensityPct / 100)) / (1 + lift);
  return ctx.ramadanDays.map((r) => (r ? factor : 1));
}

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

const supplierId = (engine: EngineParams, supplierIndex: number) => engine.leadTimes[supplierIndex]?.supplierId ?? "";

export function leadTimeMultiplier(s: ScenarioState, engine: EngineParams, supplierIndex = 0): number {
  return supplierId(engine, supplierIndex).includes("sea") ? s.supply.seaLeadTimeMultiplier : 1;
}

/** Share of orders that arrive a day late: the reliability drop, for sea and air importers only. */
export function lateProbability(s: ScenarioState, engine: EngineParams, supplierIndex = 0): number {
  const id = supplierId(engine, supplierIndex);
  return id.includes("sea") || id.includes("air") ? s.supply.reliabilityDrop / 100 : 0;
}

export function toEngineScenario(s: ScenarioState, engine: EngineParams, override: Partial<EngineScenario> = {},
  ctx: EngineContext | null = null): EngineScenario {
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
    dayFactors: ramadanDayFactors(s.calendar.ramadanIntensity, ctx),
    forecastFactor: s.policy.useDemandRecovery || !ctx ? 1 : ctx.censoredForecastFactor,
    lateProbability: lateProbability(s, engine, supplierIndex),
    ...override,
  };
}

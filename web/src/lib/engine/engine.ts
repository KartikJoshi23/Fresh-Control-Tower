/**
 * The in-browser scenario engine (P7-01): a line-for-line port of pipeline/freshpipe/engine_reference.py.
 * Its docstring is the specification. Parity with the Python golden cases (web/tests/fixtures/golden/
 * engine_cases.json) is tested to 1e-6 in tests/engine.test.ts. Do not change one side without the other.
 */
import type { SeriesFile } from "@/lib/contracts";
import { daysBetween } from "@/lib/format";

export type EngineParams = SeriesFile["engine"];

export interface EngineScenario {
  demandMultiplier?: number;
  spike?: { startDay: number; days: number; magnitude: number; warningDays?: number } | null;
  policy?: "P0" | "AI";
  tau?: number | null;
  supplierIndex?: number;
  leadTimeMultiplier?: number;
  manualOrder?: { day: number; qty: number } | null;
  /** Per-day demand factor by horizon day (calendar what-ifs such as the Ramadan effect). Real demand and both policies' plans see it. */
  dayFactors?: number[] | null;
  /** Multiplies only the AI's forecast, not real demand: below 1 when the AI learns from till sales only (censored history). */
  forecastFactor?: number;
  /** Extra chance (0-1) that an order arrives one day late; the planner does not know in advance (reliability drop). */
  lateProbability?: number;
}

export interface DayRow {
  day: number;
  receipts: number;
  demand: number;
  sales: number;
  lost: number;
  waste: number;
  onHandClose: number;
  order: number;
}

export interface Kpis {
  demand: number;
  sold: number;
  lost: number;
  waste: number;
  received: number;
  fillRate: number;
  daysWithStockout: number;
  lostMarginAED: number;
  goodwillAED: number;
  wasteAED: number;
  holdingAED: number;
  purchaseAED: number;
  totalCostAED: number;
}

const Z90 = 1.2815515655446004;
const P0_BUFFER = 0.2;
const P0_WINDOW = 28;
const P0_CENSORED_VIEW = 0.8;

/** mulberry32: bit-identical to the Python reference (and the usual JavaScript version). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normal(rng: () => number): number {
  const u1 = 1 - rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Acklam's approximation of the standard normal quantile. */
export function normPpf(pIn: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const p = Math.min(Math.max(pIn, 1e-12), 1 - 1e-12);
  const lo = 0.02425;
  const hi = 1 - lo;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > hi) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export const roundHalfUp = (x: number) => Math.floor(x + 0.5);
export const roundToCase = (raw: number, casePack: number) => Math.floor(Math.max(raw, 0) / casePack + 0.5) * casePack;
const round = (x: number, n: number) => Math.round(x * 10 ** n) / 10 ** n;

export function runEngine(engine: EngineParams, scenario: EngineScenario, seed: number | null = null): { rows: DayRow[]; kpis: Kpis } {
  const sc = { demandMultiplier: 1, spike: null, policy: "AI", tau: null, supplierIndex: 0, leadTimeMultiplier: 1, manualOrder: null,
    dayFactors: null, forecastFactor: 1, lateProbability: 0, ...scenario };
  const q = engine.horizonQuantiles;
  const horizon = q.length;
  const rng = seed === null ? null : mulberry32(seed);
  const spike = sc.spike;
  const spikeFactor = (day: number, planningDay: number | null = null) => {
    if (!spike || !(spike.startDay <= day && day < spike.startDay + spike.days)) return 1;
    if (planningDay !== null && planningDay < spike.startDay - (spike.warningDays ?? 0)) return 1;
    return spike.magnitude;
  };
  const quantile = (day: number) => q[Math.min(day, horizon - 1)];
  const dayFactor = (day: number) => sc.dayFactors?.[Math.min(day, horizon - 1)] ?? 1;
  let ordersPlaced = 0;
  const sigma = (day: number) => {
    const { p10, p90 } = quantile(day);
    return p10 > 0 && p90 > p10 ? (Math.log(p90) - Math.log(p10)) / (2 * Z90) : 0;
  };
  const supplier = engine.leadTimes[sc.supplierIndex];
  const tau = sc.tau ?? engine.optimalTau;
  const zTau = normPpf(tau);
  const shelf = engine.shelfLifeDays;
  const sellable = Math.max(shelf - engine.minRemainingShelfLifeDays, 1);
  const casePack = engine.casePack;
  let batches: { qty: number; expires: number }[] =
    engine.initialOnHand > 0 ? [{ qty: roundHalfUp(engine.initialOnHand), expires: shelf - 1 }] : [];
  const pipeline = new Map<number, number>();
  for (const o of engine.onOrder) {
    const day = daysBetween(engine.planningStart, o.arrivalDate);
    if (day >= 0) pipeline.set(day, (pipeline.get(day) ?? 0) + roundHalfUp(o.qty));
  }
  const salesHist: number[] = [];
  const rows: DayRow[] = [];
  const t = { demand: 0, sold: 0, lost: 0, waste: 0, received: 0, holdingAED: 0, daysWithStockout: 0 };
  for (let d = 0; d < horizon; d += 1) {
    const got = pipeline.get(d) ?? 0;
    pipeline.delete(d);
    if (got) batches.push({ qty: got, expires: d + shelf - 1 });
    const mu = quantile(d).p50 * sc.demandMultiplier * dayFactor(d) * spikeFactor(d);
    let demand: number;
    if (rng === null) demand = roundHalfUp(mu);
    else {
      const s = sigma(d);
      demand = Math.max(0, roundHalfUp(mu * Math.exp(s * normal(rng) - (s * s) / 2)));
    }
    let left = demand;
    batches.sort((x, y) => x.expires - y.expires);
    for (const b of batches) {
      const take = Math.min(b.qty, left);
      b.qty -= take;
      left -= take;
    }
    const sold = demand - left;
    const waste = batches.filter((b) => b.expires <= d).reduce((s, b) => s + b.qty, 0);
    batches = batches.filter((b) => b.expires > d && b.qty > 0);
    const onHand = batches.reduce((s, b) => s + b.qty, 0);
    salesHist.push(sold);
    let order = 0;
    if (d % engine.reviewPeriodDays === 0) {
      const leadMean = supplier.meanDays * sc.leadTimeMultiplier;
      const lead = rng === null ? Math.max(1, roundHalfUp(leadMean)) : Math.max(1, roundHalfUp(leadMean + supplier.sdDays * normal(rng)));
      let onOrder = 0;
      pipeline.forEach((v, k) => { if (k > d) onOrder += v; });
      if (sc.policy === "P0") {
        const recent = salesHist.slice(-P0_WINDOW);
        const avg = d > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : quantile(0).p50 * P0_CENSORED_VIEW;
        order = roundToCase((1 + P0_BUFFER) * lead * avg - onHand - onOrder, casePack);
      } else {
        const plan: number[] = [];
        for (let j = 1; j < lead + sellable; j += 1) {
          plan.push(quantile(d + j).p50 * sc.demandMultiplier * dayFactor(d + j) * spikeFactor(d + j, d) * sc.forecastFactor);
        }
        let muSum = 0;
        let variance = 0;
        for (let j = 1; j <= lead; j += 1) {
          muSum += plan[j - 1];
          variance += (sigma(d + j) * plan[j - 1]) ** 2;
        }
        const level = muSum + zTau * Math.sqrt(variance);
        const cap = Math.max(plan.slice(lead - 1, lead - 1 + sellable).reduce((s, v) => s + v, 0) - onHand - onOrder, 0);
        order = roundToCase(Math.min(level - onHand - onOrder, cap), casePack);
      }
      if (sc.manualOrder && sc.manualOrder.day === d) order = Math.trunc(sc.manualOrder.qty);
      if (order > 0) {
        // Late deliveries: a random draw in Monte Carlo runs; in the single deterministic run, exactly that share of orders
        // (every order whose running count crosses a multiple of 1/p). No draw is made when p = 0, so other runs are unchanged.
        const p = sc.lateProbability;
        let late = 0;
        if (p > 0) late = rng === null ? Number(Math.floor((ordersPlaced + 1) * p) > Math.floor(ordersPlaced * p)) : Number(rng() < p);
        ordersPlaced += 1;
        pipeline.set(d + lead + late, (pipeline.get(d + lead + late) ?? 0) + order);
      }
    }
    rows.push({ day: d, receipts: got, demand, sales: sold, lost: demand - sold, waste, onHandClose: onHand, order });
    t.demand += demand;
    t.sold += sold;
    t.lost += demand - sold;
    t.waste += waste;
    t.received += got;
    t.holdingAED += onHand * engine.holdingCostPerUnitDayAED;
    t.daysWithStockout += demand > sold ? 1 : 0;
  }
  return { rows, kpis: kpis(engine, t) };
}

function kpis(engine: EngineParams, t: { demand: number; sold: number; lost: number; waste: number; received: number; holdingAED: number; daysWithStockout: number }): Kpis {
  const price = engine.priceAED;
  const cost = engine.unitCostAED;
  const lostMargin = t.lost * (price - cost);
  const goodwill = t.lost * engine.goodwillPerUnitAED;
  const wasteAED = t.waste * (cost + engine.wasteDisposalPerUnitAED);
  return {
    demand: t.demand, sold: t.sold, lost: t.lost, waste: t.waste, received: t.received,
    fillRate: t.demand ? round(t.sold / t.demand, 9) : 1, daysWithStockout: t.daysWithStockout,
    lostMarginAED: round(lostMargin, 6), goodwillAED: round(goodwill, 6), wasteAED: round(wasteAED, 6),
    holdingAED: round(t.holdingAED, 6), purchaseAED: round(t.received * cost, 6),
    totalCostAED: round(lostMargin + goodwill + wasteAED + t.holdingAED, 6),
  };
}

export type Dist = { p10: number; p50: number; p90: number };

/** Linear interpolation between order statistics (numpy's default), rounded to 6 decimals. */
export function quantileOf(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo), 6);
}

export function monteCarlo(engine: EngineParams, scenario: EngineScenario, runs = 50, seed = 2026): Record<keyof Kpis, Dist> {
  const results = Array.from({ length: runs }, (_, r) => runEngine(engine, scenario, seed + r).kpis);
  const out = {} as Record<keyof Kpis, Dist>;
  for (const key of Object.keys(results[0]) as (keyof Kpis)[]) {
    const values = results.map((r) => r[key]).sort((a, b) => a - b);
    out[key] = { p10: quantileOf(values, 0.1), p50: quantileOf(values, 0.5), p90: quantileOf(values, 0.9) };
  }
  return out;
}

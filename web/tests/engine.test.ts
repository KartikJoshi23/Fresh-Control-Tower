/**
 * P7-02: parity of the TypeScript engine with the Python reference on every golden case (tolerance 1e-6),
 * plus the PRNG and Φ⁻¹ vectors and the surge-planner worked example from pipeline/tests/test_decisions.py.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { monteCarlo, mulberry32, normPpf, runEngine } from "@/lib/engine/engine";
import { planSurge } from "@/lib/engine/surge";

const golden = JSON.parse(readFileSync(new URL("./fixtures/golden/engine_cases.json", import.meta.url), "utf-8"));
const TOL = golden.tolerance as number;

function close(actual: unknown, expected: unknown, path = ""): void {
  if (typeof expected === "number") {
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(TOL);
  } else if (Array.isArray(expected)) {
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((v, i) => close((actual as unknown[])[i], v, `${path}[${i}]`));
  } else if (expected && typeof expected === "object") {
    for (const [k, v] of Object.entries(expected)) close((actual as Record<string, unknown>)[k], v, `${path}.${k}`);
  } else {
    expect(actual, path).toEqual(expected);
  }
}

describe("shared primitives", () => {
  it("mulberry32 reproduces the golden first five draws", () => {
    const rng = mulberry32(golden.prng.seed);
    close(Array.from({ length: 5 }, () => rng()), golden.prng.first5, "prng");
  });

  it("normPpf matches the Python values", () => {
    for (const [p, v] of Object.entries(golden.normPpf as Record<string, number>)) close(normPpf(Number(p)), v, `ppf(${p})`);
  });
});

describe("engine parity with the Python reference (golden cases)", () => {
  it(`has ${golden.cases.length} cases`, () => expect(golden.cases.length).toBe(36));
  for (const c of golden.cases) {
    it(c.id, () => {
      close(runEngine(c.engine, c.scenario), c.deterministic, "deterministic");
      close(monteCarlo(c.engine, c.scenario, c.monteCarlo.runs, c.monteCarlo.seed), c.monteCarlo.kpis, "monteCarlo");
    });
  }
});

describe("surge planner (worked example shared with the Python test)", () => {
  it("finds the order windows, the single-delivery cover and the options", () => {
    const fast = { id: "fast", leadDays: 1, costFactor: 1.3, co2ePerKg: 0.05 };
    const slow = { id: "primary", leadDays: 3, costFactor: 1.0, co2ePerKg: 0.02 };
    const out = planSurge({ today: 2, spikeStart: 10, spikeDays: 3, extraPerDay: 50, shelfLife: 4, minRemaining: 1,
      options: [slow, fast], unitCost: 3, price: 6, kgPerUnit: 0.5 });
    expect(out.latestSafeOrderDay).toEqual({ primary: 6, fast: 8 });
    expect([out.singleDeliveryCoversDays, out.earliestUsefulArrivalDay, out.minimumWarningDays]).toEqual([2, 10, 2]);
    const by = Object.fromEntries(out.options.map((o) => [o.option, o]));
    expect([by.prebuild_primary.lostUnits, by.split.lostUnits, by.accept_shortfall.lostUnits]).toEqual([50, 0, 150]);
  });
});

describe("scenario → engine mapping", async () => {
  const { DEFAULT_SCENARIO, activeChips, withDisruption } = await import("@/lib/state/scenario");
  const { engineContext, toEngineScenario, PER_DEGREE_C } = await import("@/lib/engine/scenario");
  const read = (path: string) => JSON.parse(readFileSync(new URL(`../public/data/${path}`, import.meta.url), "utf-8"));
  const engine = golden.cases[0].engine;
  const base = structuredClone(DEFAULT_SCENARIO);

  it("the default scenario is the plain AI run at the tuned τ", () => {
    expect(toEngineScenario(base, engine)).toMatchObject({ demandMultiplier: 1, spike: null, policy: "AI", tau: null, leadTimeMultiplier: 1, manualOrder: null });
  });

  it("maps the spike date to a planning day, P0, the heatwave effect and an absolute demand level", () => {
    const s = structuredClone(DEFAULT_SCENARIO);
    s.spike = { ...s.spike, enabled: true, date: engine.horizonQuantiles[5].date, magnitude: 2, durationDays: 3, warningDays: 2 };
    s.policy.policy = "P0";
    s.weather = { heatwave: true, heatwaveDeltaC: 4 };
    const out = toEngineScenario(s, engine);
    expect(out.spike).toEqual({ startDay: 5, days: 3, magnitude: 2, warningDays: 2 });
    expect(out.policy).toBe("P0");
    expect(out.demandMultiplier).toBeCloseTo(PER_DEGREE_C ** 4, 12);
    s.weather.heatwave = false;
    const mean = engine.horizonQuantiles.reduce((a: number, q: { p50: number }) => a + q.p50, 0) / engine.horizonQuantiles.length;
    s.demand.ordersPerDay = 2 * mean;
    expect(toEngineScenario(s, engine).demandMultiplier).toBeCloseTo(2, 12);
  });

  it("wires the Ramadan effect, late import deliveries and learning from till sales only", () => {
    const bananas = read("series/dxb-marina__bananas-1kg.json");
    const ctx = engineContext(bananas, read("calendar.json"), read("ablation.json"));
    // The horizon (11 Feb - 17 Mar 2026) is Ramadan 2026's build-up week and its first 28 days.
    expect(ctx.ramadanDays.filter(Boolean).length).toBe(35);
    expect(ctx.ramadanLift).toBeGreaterThan(0);
    const s = structuredClone(DEFAULT_SCENARIO);
    expect(toEngineScenario(s, bananas.engine, {}, ctx)).toMatchObject({ dayFactors: null, forecastFactor: 1, lateProbability: 0 });
    s.calendar.ramadanIntensity = 0;
    expect(toEngineScenario(s, bananas.engine, {}, ctx).dayFactors?.[0]).toBeCloseTo(1 / (1 + (ctx.ramadanLift ?? 0)), 12);
    s.calendar.ramadanIntensity = 150;
    expect(toEngineScenario(s, bananas.engine, {}, ctx).dayFactors?.[0]).toBeGreaterThan(1);
    s.policy.useDemandRecovery = false;
    expect(toEngineScenario(s, bananas.engine, {}, ctx).forecastFactor).toBeCloseTo((1 - 0.3102) / (1 - 0.0594), 12);
    s.supply.reliabilityDrop = 30;
    expect(toEngineScenario(s, bananas.engine, {}, ctx).lateProbability).toBeCloseTo(0.3, 12);      // a sea importer
    // Lettuce buys from a local farm, then a GCC truck, then an air importer: only the importer is late.
    expect([0, 1, 2].map((i) => toEngineScenario(s, engine, { supplierIndex: i }).lateProbability)).toEqual([0, 0, 0.3]);
  });

  it("applies the sea delivery time on its own, and the disruption switch sets both delivery settings", () => {
    const s = structuredClone(DEFAULT_SCENARIO);
    s.supply.seaLeadTimeMultiplier = 1.5;
    expect(toEngineScenario(s, read("series/dxb-marina__bananas-1kg.json").engine).leadTimeMultiplier).toBe(1.5);
    expect(toEngineScenario(s, engine).leadTimeMultiplier).toBe(1);                                  // local farm
    const hz = withDisruption(DEFAULT_SCENARIO, "hormuz2026");
    expect(hz.supply).toMatchObject({ disruptionPreset: "hormuz2026", seaLeadTimeMultiplier: 2, reliabilityDrop: 30 });
    expect(withDisruption(hz, "none").supply).toEqual(DEFAULT_SCENARIO.supply);
    expect(activeChips(hz)).toEqual(["Hormuz disruption"]);
    expect(activeChips({ ...hz, supply: { ...hz.supply, reliabilityDrop: 10 } })).toEqual(["Hormuz disruption", "10% of import deliveries late"]);
  });
});

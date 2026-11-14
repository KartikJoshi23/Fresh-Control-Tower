/** One recompute: deterministic + Monte Carlo for each named scenario. Runs in the Web Worker (or inline). */
import { type Dist, type EngineParams, type EngineScenario, type Kpis, monteCarlo, runEngine } from "./engine";

export interface ComputeRequest {
  id: number;
  engine: EngineParams;
  scenarios: { key: string; scenario: EngineScenario }[];
  runs: number;
}

export interface ComputeResult {
  id: number;
  ms: number;
  results: Record<string, { deterministic: ReturnType<typeof runEngine>; mc: Record<keyof Kpis, Dist> }>;
}

export function compute(req: ComputeRequest): ComputeResult {
  const t0 = performance.now();
  const results: ComputeResult["results"] = {};
  for (const { key, scenario } of req.scenarios) {
    results[key] = { deterministic: runEngine(req.engine, scenario), mc: monteCarlo(req.engine, scenario, req.runs) };
  }
  return { id: req.id, ms: performance.now() - t0, results };
}

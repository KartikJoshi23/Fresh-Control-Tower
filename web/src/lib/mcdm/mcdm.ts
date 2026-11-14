/**
 * Supplier ranking in the browser (P8-02): AHP, Shannon-entropy weights and TOPSIS, ported from
 * pipeline/freshpipe/mcdm.py. Parity with Python is tested in tests/mcdm.test.ts on the published example
 * (arXiv:2407.09931, ch. 15, Ex. 2) and on golden cases computed from mcdm.json (mcdm_cases.json).
 */
import { SAATY_RANDOM_INDEX, type McdmFile } from "@/lib/contracts";

export type Matrix = number[][];

/** Principal-eigenvector weights by power iteration (a positive reciprocal matrix has a unique Perron vector). */
export function ahp(matrix: Matrix) {
  const n = matrix.length;
  matrix.forEach((row, i) => row.forEach((v, j) => {
    if (Math.abs(v * matrix[j][i] - 1) > 1e-9) throw new Error("AHP matrix must be reciprocal");
  }));
  let w = Array(n).fill(1 / n) as number[];
  for (let it = 0; it < 1000; it += 1) {
    const next = matrix.map((row) => row.reduce((s, v, j) => s + v * w[j], 0));
    const sum = next.reduce((s, v) => s + v, 0);
    const norm = next.map((v) => v / sum);
    const delta = Math.max(...norm.map((v, i) => Math.abs(v - w[i])));
    w = norm;
    if (delta < 1e-15) break;
  }
  const aw = matrix.map((row) => row.reduce((s, v, j) => s + v * w[j], 0));
  const lambdaMax = aw.reduce((s, v, i) => s + v / w[i], 0) / n;
  const ci = n > 2 ? (lambdaMax - n) / (n - 1) : 0;
  const ri = SAATY_RANDOM_INDEX[n - 1];
  return { weights: w, lambdaMax, ci, cr: ri ? ci / ri : 0, ri };
}

/** Shannon-entropy weights of a (suppliers × criteria) matrix of non-negative values. */
export function entropyWeights(x: Matrix): number[] {
  const m = x.length;
  const k = x[0].length;
  const d = Array.from({ length: k }, (_, j) => {
    const col = x.map((r) => r[j]);
    const sum = col.reduce((s, v) => s + v, 0) || 1;
    const e = -col.reduce((s, v) => { const p = v / sum; return s + (p > 0 ? p * Math.log(p) : 0); }, 0) / Math.log(m);
    return 1 - e;
  });
  const total = d.reduce((s, v) => s + v, 0);
  return d.map((v) => v / total);
}

/** Closeness to the ideal (0–1, higher is better) for each supplier. */
export function topsis(x: Matrix, weights: number[], benefit: boolean[]): number[] {
  const k = weights.length;
  const norms = Array.from({ length: k }, (_, j) => Math.sqrt(x.reduce((s, r) => s + r[j] ** 2, 0)));
  const v = x.map((r) => r.map((val, j) => (norms[j] > 0 ? val / norms[j] : val) * weights[j]));
  const col = (j: number) => v.map((r) => r[j]);
  const best = weights.map((_, j) => (benefit[j] ? Math.max(...col(j)) : Math.min(...col(j))));
  const worst = weights.map((_, j) => (benefit[j] ? Math.min(...col(j)) : Math.max(...col(j))));
  return v.map((r) => {
    const plus = Math.sqrt(r.reduce((s, val, j) => s + (val - best[j]) ** 2, 0));
    const minus = Math.sqrt(r.reduce((s, val, j) => s + (val - worst[j]) ** 2, 0));
    return plus + minus > 0 ? minus / (plus + minus) : 0.5;
  });
}

/** 1 = best; ties keep the input order (as numpy's stable argsort). */
export function ranks(scores: number[]): number[] {
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out = Array(scores.length).fill(0) as number[];
  order.forEach(([, i], r) => { out[i] = r + 1; });
  return out;
}

/** Move each weight by ±step (relative), rescale, and record whether the top supplier changes. */
export function sensitivity(x: Matrix, weights: number[], benefit: boolean[], step = 0.2) {
  const base = ranks(topsis(x, weights, benefit));
  const top = base.indexOf(1);
  const out: { criterion: number; change: number; topUnchanged: boolean; ranks: number[]; newTop: number }[] = [];
  weights.forEach((_, j) => {
    for (const sign of [-1, 1]) {
      const w = weights.map((v, i) => (i === j ? v * (1 + sign * step) : v));
      const sum = w.reduce((s, v) => s + v, 0);
      const r = ranks(topsis(x, w.map((v) => v / sum), benefit));
      out.push({ criterion: j, change: sign * step, topUnchanged: r.indexOf(1) === top, ranks: r, newTop: r.indexOf(1) });
    }
  });
  return out;
}

/** The (suppliers × criteria) matrix with a scenario's adjustments applied (null = normal conditions). */
export function applyScenario(file: McdmFile, scenarioId: string | null): Matrix {
  const ids = file.criteria.map((c) => c.id);
  const x = file.suppliers.map((s) => ids.map((c) => s.metrics[c]));
  const scenario = file.scenarios.find((s) => s.id === scenarioId);
  if (scenario) {
    const rows = new Map(file.suppliers.map((s, i) => [s.id, i]));
    for (const a of scenario.adjustments) {
      const i = rows.get(a.supplierId)!;
      const j = ids.indexOf(a.criterionId);
      x[i][j] = a.op === "multiply" ? x[i][j] * a.value : x[i][j] + a.value;
    }
  }
  return x;
}

/** Fill suppliers in order of score up to capacity (the browser's allocation rule; the LP agrees on a linear score). */
export function allocateGreedy(demand: number, capacity: number[], score: number[]): number[] {
  const out = Array(capacity.length).fill(0) as number[];
  let left = demand;
  for (const [, i] of score.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])) {
    out[i] = Math.min(left, capacity[i]);
    left -= out[i];
  }
  return out;
}

/**
 * Which suppliers can supply each category (mirrors COMPATIBLE in pipeline/freshpipe/optimise.py; the golden file
 * carries the Python copy and tests/mcdm.test.ts checks they agree).
 */
export const COMPATIBLE: Record<string, string[]> = {
  "leafy-greens": ["sup-local-farm", "sup-gcc-truck", "sup-air-import"],
  berries: ["sup-air-europe", "sup-air-import"],
  "stone-fruit": ["sup-sea-europe", "sup-sea-import", "sup-sea-khorfakkan", "sup-air-europe"],
  "salad-vegetables": ["sup-local-farm", "sup-gcc-truck", "sup-gcc-ksa"],
  dairy: ["sup-gcc-ksa", "sup-gcc-truck"],
  bakery: ["sup-local-bakery"],
  poultry: ["sup-gcc-ksa", "sup-gcc-truck"],
  dates: ["sup-gcc-ksa", "sup-gcc-truck"],
  fruit: ["sup-sea-import", "sup-sea-khorfakkan", "sup-sea-europe", "sup-air-import"],
};

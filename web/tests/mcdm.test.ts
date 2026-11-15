/** P8-02: the browser's AHP / entropy / TOPSIS agree with the Python pipeline. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { McdmFile } from "@/lib/contracts";
import { ahp, allocateGreedy, applyScenario, COMPATIBLE, entropyWeights, ranks, sensitivity, topsis } from "@/lib/mcdm/mcdm";

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf-8"));
const golden = read("./fixtures/golden/mcdm_cases.json");
const file = McdmFile.parse(read("../public/data/mcdm.json"));
const benefit = file.criteria.map((c) => c.type === "benefit");

describe("published example (arXiv:2407.09931, ch. 15, Ex. 2)", () => {
  const x = [[20, 8, 13, 4, 9], [5, 2, 8, 17, 10], [4, 17, 6, 2, 1], [6, 6, 9, 15, 3]];
  const b = [false, true, true, false, false];

  it("entropy weights", () => {
    entropyWeights(x).forEach((w, i) => expect(w).toBeCloseTo([0.233374, 0.216633, 0.03823, 0.262035, 0.249728][i], 6));
  });

  it("TOPSIS closeness and ranks", () => {
    const c = topsis(x, [0.233374, 0.216633, 0.03823, 0.262035, 0.249728], b);
    c.forEach((v, i) => expect(v).toBeCloseTo([0.398895, 0.358287, 0.958917, 0.508982][i], 6));
    expect(ranks(c)).toEqual([3, 4, 1, 2]);
  });
});

describe("AHP", () => {
  it("is exact on a perfectly consistent matrix", () => {
    const v = [4, 2, 1, 1];
    const out = ahp(v.map((a) => v.map((b) => a / b)));
    out.weights.forEach((w, i) => expect(w).toBeCloseTo(v[i] / 8, 9));
    expect(out.lambdaMax).toBeCloseTo(4, 9);
    expect(out.cr).toBeCloseTo(0, 9);
  });

  it("reproduces the board-preference weights and consistency ratio in mcdm.json", () => {
    const out = ahp(file.ahp.matrix);
    out.weights.forEach((w, i) => expect(Math.abs(w - file.ahp.weights[i])).toBeLessThanOrEqual(5e-7));
    expect(Math.abs(out.lambdaMax - file.ahp.lambdaMax)).toBeLessThanOrEqual(5e-7);
    expect(Math.abs(out.cr - file.ahp.cr)).toBeLessThanOrEqual(5e-7);
    expect(out.cr).toBeLessThan(0.1);
  });

  it("rejects a non-reciprocal matrix", () => expect(() => ahp([[1, 3], [3, 1]])).toThrow());
});

describe("golden cases from the pipeline (mcdm_cases.json)", () => {
  it("entropy weights from the supplier metrics", () => {
    entropyWeights(applyScenario(file, null)).forEach((w, i) => expect(Math.abs(w - golden.entropyFromMetrics[i])).toBeLessThanOrEqual(1e-8));
  });

  for (const c of golden.cases) {
    it(`TOPSIS + sensitivity: ${c.scenario ?? "normal"} / ${c.weightMode}`, () => {
      const x = applyScenario(file, c.scenario);
      const w = c.weightMode === "ahp" ? file.ahp.weights : file.entropyWeights;
      topsis(x, w, benefit).forEach((v, i) => expect(Math.abs(v - c.closeness[i])).toBeLessThanOrEqual(golden.tolerance));
      expect(ranks(topsis(x, w, benefit))).toEqual(c.ranks);
      const s = sensitivity(x, w, benefit);
      expect(s.map((r) => [r.change, r.topUnchanged, r.ranks])).toEqual(c.sensitivity.map((r: { change: number; topUnchanged: boolean; ranks: number[] }) => [r.change, r.topUnchanged, r.ranks]));
    });
  }

  it("the category → supplier map matches the pipeline", () => expect(COMPATIBLE).toEqual(golden.compatible));
});

it("greedy allocation fills the best suppliers first, up to capacity", () => {
  expect(allocateGreedy(5000, [1500, 4000, 8000], [0.6, 0.8, 0.4])).toEqual([1000, 4000, 0]);
});

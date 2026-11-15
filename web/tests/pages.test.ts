/** Page logic (Parts 6–9): worked examples for the numbers the pages compute in the browser. */
import { describe, expect, it } from "vitest";

import { bias, explainBias, legacyForecast } from "@/app/demand/DemandLab";
import { revealTotals } from "@/components/signature/HiddenDemandReveal";

const row = (date: string, recordedSales: number, trueDemand: number | null = null, recoveredDemand: number | null = null) =>
  ({ date, recordedSales, trueDemand, recoveredDemand, fcP10: null, fcP50: null, fcP90: null, stockoutHours: 0, receipts: 0,
    waste: 0, onHandClose: 0, lostSales: null, promo: false });

describe("Demand Lab", () => {
  it("legacy forecast = the 28-day average of recorded sales up to the day before", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`2026-01-${String(i + 1).padStart(2, "0")}`, i < 28 ? 10 : 50));
    const fc = legacyForecast(rows);
    expect(fc[27]).toBeNull();
    expect(fc[28]).toBe(10);
    expect(fc[29]).toBeCloseTo((27 * 10 + 50) / 28);
  });

  it("bias and WAPE: worked example", () => {
    // pred 8 and 12 vs truth 10 and 10: bias 0, WAPE 4/20 = 0.2; pairs with a null are skipped.
    expect(bias([8, 12, null], [10, 10, 5])).toEqual({ wpe: 0, wape: 0.2, n: 2 });
  });

  it("explains the measured accuracy in plain words, and never more", () => {
    expect(explainBias("The AI forecast", -0.06, 0.3)).toBe("The AI forecast was too low by 6% on average, and off by 30% on a typical day.");
    expect(explainBias("X", 0.2, 0.25)).toContain("too high by 20%");
    expect(explainBias("X", 0.001, 0.1)).toContain("about right on average");
  });
});

describe("Hidden Demand Reveal", () => {
  it("counts hidden demand, its revenue and the share the AI recovers", () => {
    // Day 1: true 10, sold 6 -> 4 hidden; recovered 9 finds 3. Day 2: true 5, sold 5 -> nothing hidden.
    // Day 3: recovered 20 > true 8, sold 4 -> 4 hidden, found capped at 4. Hidden 8, found 7, price 2.5 -> AED 20.
    const t = revealTotals([row("d1", 6, 10, 9), row("d2", 5, 5, 5), row("d3", 4, 8, 20)], 2.5);
    expect(t).toEqual({ hiddenUnits: 8, hiddenAED: 20, recoveredShare: 7 / 8 });
  });
});

describe("Live Ops approvals", async () => {
  const { approvalOf } = await import("@/app/live/LiveOps");
  const po = { id: "po-1", createdAt: "2026-03-10T06:00", supplierId: "s", storeId: "a", skuId: "b", qty: 10, etaAt: "2026-03-11T06:00", reason: "r" };
  it("approve-exceptions keeps routine orders automatic and holds flagged ones", () => {
    expect(approvalOf({ ...po, approval: "auto" }, "exceptions", {})).toBe("auto");
    expect(approvalOf({ ...po, approval: "needs_approval" }, "exceptions", {})).toBe("needs_approval");
  });
  it("auto-within-guardrails blocks the flagged orders", () => {
    expect(approvalOf({ ...po, approval: "needs_approval" }, "auto", {})).toBe("blocked");
    expect(approvalOf({ ...po, approval: "auto" }, "auto", {})).toBe("auto");
  });
  it("manual holds every order until a person decides", () => {
    expect(approvalOf({ ...po, approval: "auto" }, "manual", {})).toBe("needs_approval");
    expect(approvalOf({ ...po, approval: "auto" }, "manual", { "po-1": "rejected" })).toBe("rejected");
  });
});

describe("Impact helpers", async () => {
  const { equalAvailability, tornado, waterfallBars } = await import("@/app/impact/Impact");
  const { FrontierFile, ImpactFile } = await import("@/lib/contracts");
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), "utf-8"));
  const frontier = FrontierFile.parse(read("frontier.json"));
  const impact = ImpactFile.parse(read("impact.json"));

  it("the waterfall's floating bars end at the AI's total", () => {
    const bars = waterfallBars(impact.waterfall);
    const deltas = bars.filter((b) => b.kind === "delta");
    expect(deltas.at(-1)!.to).toBeCloseTo(impact.waterfall.at(-1)!.valueAED, 0);
    deltas.forEach((b, i) => expect(b.from).toBeCloseTo(i === 0 ? impact.waterfall[0].valueAED : deltas[i - 1].to, 6));
  });

  it("the tornado is centred on the base saving and each bar swings by ±pct of its component", () => {
    const t = tornado(impact.waterfall, 0.25);
    expect(t.saving).toBeCloseTo(impact.waterfall[0].valueAED - impact.waterfall.at(-1)!.valueAED, 0);
    for (const b of t.bars) {
      const v = impact.waterfall.find((r) => r.id === b.id)!.valueAED;
      expect(Math.abs(b.high - b.low)).toBeCloseTo(Math.abs(v) * 0.5, 6);
    }
  });

  it("equal availability: the AI's lowest setting matches the legacy rule's best with about 41% less waste", () => {
    const eq = equalAvailability(frontier, 0.5);
    expect(Math.abs(eq.gapPts)).toBeLessThan(0.5);
    expect(eq.wasteChange).toBeLessThan(-35);
  });
});

it("the risk register carries all eight risks from plan §14.2", async () => {
  const { RISKS } = await import("@/app/roadmap/Roadmap");
  expect(RISKS).toHaveLength(8);
  expect(RISKS.every((r) => r.mitigation && r.where)).toBe(true);
});

describe("formats (team decision, 15 Nov 2026)", async () => {
  const f = await import("@/lib/format");
  it("weights are always kilograms with separators", () => {
    expect(f.fmtKg(128450.4)).toBe("128,450 kg");
    expect(f.fmtKg(640)).toBe("640 kg");
    expect(f.fmtKg(2.46)).toBe("2.5 kg");
    expect(f.fmtKg(-1500)).toBe("−1,500 kg");
  });
  it("money is in full below a million and in millions above", () => {
    expect(f.fmtAED(7768.4)).toBe("AED 7,768");
    expect(f.fmtAED(480093)).toBe("AED 480,093");
    expect(f.fmtAED(2_140_000)).toBe("AED 2.14 million");
    expect(f.fmtAED(-6_472_297)).toBe("−AED 6.47 million");
    expect(f.aedAxis(9e6).unit).toBe("AED million");
    expect(f.aedAxis(9e6).tick(2e6)).toBe("2");
  });
  it("dates are day-first", () => {
    expect(f.fmtDate("2026-03-05")).toBe("05/03/2026");
    expect(f.fmtDayMonth("2026-11-15")).toBe("15/11");
    expect(f.fmtDateTime("2026-03-10T06:00")).toBe("10/03/2026 06:00");
    expect(f.fmtWeekdayDate("2026-11-15")).toBe("Sun 15/11/2026");
  });
});

describe("chart filter (show only / add / show all)", async () => {
  const { nextShown } = await import("@/components/charts/primitives/seriesFilter");
  const ids = ["a", "b", "c"];
  it("the first click shows only that line; more clicks add or remove lines", () => {
    expect(nextShown(null, "b", ids)).toEqual(["b"]);
    expect(nextShown(["b"], "a", ids)).toEqual(["b", "a"]);
    expect(nextShown(["b", "a"], "a", ids)).toEqual(["b"]);
  });
  it("never leaves an empty chart, and selecting every line means 'all'", () => {
    expect(nextShown(["b"], "b", ids)).toBeNull();
    expect(nextShown(["a", "b"], "c", ids)).toBeNull();
  });
});

it("plain names replace the policy codes", async () => {
  const { policyName, serviceTargetLabel } = await import("@/lib/labels");
  expect(["P0", "P1", "P2", "P3"].map(policyName)).toEqual(["Current method", "AI daily ordering", "AI + midday top-up", "AI + top-up + best supplier"]);
  expect(serviceTargetLabel(0.85)).toBe("Stock-level setting 85%");
});

it("Live Ops order reasons read in plain words", async () => {
  const { plainReason } = await import("@/app/live/LiveOps");
  expect(plainReason("Order-up-to at the SKU's service quantile (τ = 0.70).")).toContain("stock-level setting 70%");
  expect(plainReason("Noon top-up: the morning's sales point to a shortfall before tomorrow's delivery.")).toMatch(/^Midday top-up/);
});

it("Live Ops alert messages spell out the shorthand", async () => {
  const { plainMessage } = await import("@/app/live/LiveOps");
  expect(plainMessage("Bananas: about 4 h of cover left at the forecast rate.")).toBe("Bananas: about 4 hours of stock left at the expected sales rate.");
  expect(plainMessage("Order of 19 units (needs approval).")).toBe("Order of 19 units (waiting for approval).");
});

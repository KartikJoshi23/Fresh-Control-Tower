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

  it("explains only what the measured bias shows", () => {
    expect(explainBias(-0.03, false)).toContain("close to unbiased");
    expect(explainBias(-0.2, false)).toContain("under-forecasts");
    expect(explainBias(0.2, false)).toContain("over-forecasts");
    expect(explainBias(0, true)).toContain("under-forecasts");
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
  it("guardrails keep auto orders automatic and hold flagged ones", () => {
    expect(approvalOf({ ...po, approval: "auto" }, "guardrails", {})).toBe("auto");
    expect(approvalOf({ ...po, approval: "needs_approval" }, "guardrails", {})).toBe("needs_approval");
  });
  it("approve-everything holds every order until a person decides", () => {
    expect(approvalOf({ ...po, approval: "auto" }, "all", {})).toBe("needs_approval");
    expect(approvalOf({ ...po, approval: "auto" }, "all", { "po-1": "rejected" })).toBe("rejected");
  });
});

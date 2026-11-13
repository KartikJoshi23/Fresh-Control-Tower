/**
 * Series contract: series/{storeId}__{skuId}.json (implementation-plan.md §2.4).
 * One file per hero store-SKU: the daily history plus the parameters the browser engine needs.
 */
import { z } from "zod";
import { Header, Id, IsoDate, NonNegative, Profile24, Share } from "./common";

export const SeriesRow = z
  .strictObject({
    date: IsoDate,
    /** Synthetic ground truth. Null wherever true demand is unknown (it never exists in real data). */
    trueDemand: NonNegative.nullable(),
    /** What the legacy (P0) system recorded, censored by stockouts. */
    recordedSales: NonNegative,
    recoveredDemand: NonNegative.nullable(),
    fcP10: NonNegative.nullable(),
    fcP50: NonNegative.nullable(),
    fcP90: NonNegative.nullable(),
    stockoutHours: z.number().min(0).max(24),
    /** Stock-in under the baseline policy (sales units). */
    receipts: NonNegative,
    /** Stock-out by expiry (sales units). */
    waste: NonNegative,
    onHandClose: NonNegative,
    /** trueDemand − recordedSales where true demand is known; otherwise null. */
    lostSales: NonNegative.nullable(),
    promo: z.boolean(),
  })
  .refine(
    (r) =>
      r.fcP10 === null ||
      r.fcP50 === null ||
      r.fcP90 === null ||
      (r.fcP10 <= r.fcP50 && r.fcP50 <= r.fcP90),
    { message: "Expected fcP10 <= fcP50 <= fcP90" },
  );

export const SupplierLeadTime = z.strictObject({
  supplierId: Id,
  meanDays: z.number().positive(),
  sdDays: NonNegative,
});

export const QuantileDay = z
  .strictObject({ date: IsoDate, p10: NonNegative, p50: NonNegative, p90: NonNegative })
  .refine((q) => q.p10 <= q.p50 && q.p50 <= q.p90, { message: "Expected p10 <= p50 <= p90" });

export const OnOrder = z.strictObject({
  arrivalDate: IsoDate,
  qty: NonNegative,
  supplierId: Id,
});

/** Everything the in-browser scenario engine needs for one store-SKU (Part 7). */
export const EngineParams = z.strictObject({
  planningStart: IsoDate,
  /** Forecast quantiles for the planning horizon (up to 35 days). */
  horizonQuantiles: z.array(QuantileDay).min(7),
  leadTimes: z.array(SupplierLeadTime).min(1),
  shelfLifeDays: z.number().int().positive(),
  minRemainingShelfLifeDays: z.number().int().nonnegative(),
  unitCostAED: z.number().positive(),
  priceAED: z.number().positive(),
  holdingCostPerUnitDayAED: NonNegative,
  wasteDisposalPerUnitAED: NonNegative,
  goodwillPerUnitAED: NonNegative,
  reviewPeriodDays: z.number().int().positive(),
  casePack: z.number().int().positive(),
  intradayProfile: Profile24,
  ramadanProfile: Profile24,
  /** Optimised order-up-to quantile from the offline simulation-optimisation (plan §4.1). */
  optimalTau: Share,
  initialOnHand: NonNegative,
  onOrder: z.array(OnOrder),
});

export const SeriesFile = Header.extend({
  storeId: Id,
  skuId: Id,
  rows: z.array(SeriesRow).min(1),
  engine: EngineParams,
}).superRefine((file, ctx) => {
  for (let i = 1; i < file.rows.length; i += 1) {
    if (file.rows[i].date <= file.rows[i - 1].date) {
      ctx.addIssue({ code: "custom", path: ["rows", i, "date"], message: "Dates must be strictly increasing" });
    }
  }
});
export type SeriesFile = z.infer<typeof SeriesFile>;

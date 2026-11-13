/**
 * Result contracts: backtest, frontier, realdata, ablation and impact (implementation-plan.md §2.4).
 */
import { z } from "zod";
import { DateRange, Dist, Header, Id, NonNegative, Share } from "./common";

/** P0 Baseline · P1 AI-Daily · P2 AI-Intraday · P3 AI-Intraday + Smart Sourcing (plan §4.5). */
export const PolicyId = z.enum(["P0", "P1", "P2", "P3"]);

export const Policy = z.strictObject({ id: PolicyId, label: z.string().min(1), description: z.string().min(1) });

export const BacktestWindow = z.strictObject({
  id: Id,
  label: z.string().min(1),
  range: DateRange,
  description: z.string().min(1),
});

export const Kpis = z.strictObject({
  availabilityPct: Dist,
  fillRatePct: Dist,
  lostSalesUnits: Dist,
  lostSalesAED: Dist,
  wasteKg: Dist,
  wastePctOfReceipts: Dist,
  holdingAED: Dist,
  expediteAED: Dist,
  totalCostAED: Dist,
  co2eKg: Dist,
  daysOfCover: Dist,
});

export const BacktestResult = z.strictObject({
  windowId: Id,
  policyId: PolicyId,
  runs: z.number().int().positive(),
  kpis: Kpis,
});

/** backtest.json: KPI distributions per stress window and policy. */
export const BacktestFile = Header.extend({
  windows: z.array(BacktestWindow).min(1),
  policies: z.array(Policy).length(4),
  results: z.array(BacktestResult).min(1),
}).superRefine((file, ctx) => {
  const windowIds = new Set(file.windows.map((w) => w.id));
  file.results.forEach((r, i) => {
    if (!windowIds.has(r.windowId)) {
      ctx.addIssue({ code: "custom", path: ["results", i, "windowId"], message: `Unknown window "${r.windowId}"` });
    }
  });
});
export type BacktestFile = z.infer<typeof BacktestFile>;

export const FrontierPoint = z.strictObject({
  serviceTarget: z.number().min(0.5).max(0.999),
  availabilityPct: z.number().min(0).max(100),
  wastePct: z.number().min(0).max(100),
  totalCostAED: NonNegative,
});

/** frontier.json: the waste–availability trade-off curves. */
export const FrontierFile = Header.extend({
  scope: z.string().min(1),
  curves: z
    .array(z.strictObject({ policyId: PolicyId, points: z.array(FrontierPoint).min(2) }))
    .min(1),
  recommended: z.strictObject({ policyId: PolicyId, serviceTarget: z.number().min(0.5).max(0.999) }),
});
export type FrontierFile = z.infer<typeof FrontierFile>;

export const RealDatasetEntry = z.strictObject({
  datasetId: Id,
  label: z.string().min(1),
  period: DateRange,
  /** Share of SKUs out of stock by hour, excluding all-day outages. */
  stockoutShareByHour: z.array(Share).length(24),
  oosHoursShare: Share,
  daysWithStockoutShare: Share,
  allDayOutageShare: Share,
  censoring: z.strictObject({
    morningSalesSoldOutLater: NonNegative,
    morningSalesNoStockout: NonNegative,
    ratio: z.number().positive(),
  }),
  /** Masking test (plan §3.5). Shares, not percentages; null until Part 3 produces them. */
  masking: z.strictObject({
    method: z.string().min(1),
    recoveryWape: z.number().nullable(),
    recoveryWpe: z.number().nullable(),
    naiveForecastWpe: z.number().nullable(),
    recoveredForecastWpe: z.number().nullable(),
  }),
});

/** realdata.json: results computed on the REAL FreshRetailNet datasets. */
export const RealDataFile = Header.extend({
  entries: z.array(RealDatasetEntry).min(1),
  paperReference: z.strictObject({
    naiveWpe: z.number(),
    bestRecoveryWape: z.number(),
    sourceId: Id,
  }),
  notes: z.array(z.string()),
});
export type RealDataFile = z.infer<typeof RealDataFile>;

export const AblationGroup = z.strictObject({
  id: Id,
  label: z.string().min(1),
  description: z.string().min(1),
  wape: NonNegative,
  wpe: z.number(),
  deltaWape: z.number(),
  deltaWpe: z.number(),
});

/** ablation.json: the value of each data source for the forecast (answers KQ2). */
export const AblationFile = Header.extend({
  evaluation: z.string().min(1),
  full: z.strictObject({ wape: NonNegative, wpe: z.number() }),
  groups: z.array(AblationGroup).min(1),
});
export type AblationFile = z.infer<typeof AblationFile>;

export const WaterfallStep = z.strictObject({
  id: Id,
  label: z.string().min(1),
  valueAED: z.number(),
  kind: z.enum(["baseline", "delta", "total"]),
});

export const Assumption = z.strictObject({
  id: Id,
  label: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  sourceId: Id.nullable(),
  note: z.string(),
});

/** impact.json: annualised cost and sustainability impact (labelled illustrative and synthetic). */
export const ImpactFile = Header.extend({
  period: DateRange,
  annualisation: z.string().min(1),
  waterfall: z.array(WaterfallStep).min(2),
  waste: z.strictObject({ baselineKg: NonNegative, aiKg: NonNegative, foodRescueKg: NonNegative }),
  co2e: z.strictObject({
    baselineKg: NonNegative,
    aiKg: NonNegative,
    byComponent: z.array(
      z.strictObject({ id: Id, label: z.string().min(1), baselineKg: NonNegative, aiKg: NonNegative }),
    ),
  }),
  assumptions: z.array(Assumption),
});
export type ImpactFile = z.infer<typeof ImpactFile>;

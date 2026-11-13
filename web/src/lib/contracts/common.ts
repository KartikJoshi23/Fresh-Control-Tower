/**
 * Shared building blocks for the data contracts (implementation-plan.md §2.4).
 *
 * Contracts are FROZEN from Phase 4. Any change (a new field, a renamed field, a new file)
 * needs a change request in docs/decisions/, a CONTRACT_VERSION bump, and a re-export of
 * the JSON Schemas (`npm run contracts:export`) so the Python pipeline validates against
 * the same rules.
 *
 * Objects are strict: unknown keys are rejected, so drift between the pipeline and the web
 * app is caught immediately instead of silently ignored.
 */
import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0";

/** Where a number comes from. Every chart shows this as a provenance chip. */
export const Provenance = z.enum([
  "REAL",
  "CALIBRATED_SYNTHETIC",
  "SCENARIO",
  "SIMULATED_FEED",
  "DERIVED",
  "PRECOMPUTED",
]);
export type Provenance = z.infer<typeof Provenance>;

/** Calendar date in Asia/Dubai, YYYY-MM-DD. */
export const IsoDate = z.iso.date();

/** Asia/Dubai local timestamp at hour resolution, for example 2026-03-10T06:00. */
export const LocalHour = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):00$/, "Expected YYYY-MM-DDTHH:00 in Asia/Dubai time");

/** Stable identifier: lower-case letters, digits, hyphens and underscores. */
export const Id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Expected a lower-case identifier");

export const NonNegative = z.number().nonnegative();

/** A share between 0 and 1 (not a percentage). */
export const Share = z.number().min(0).max(1);

/** Summary of a Monte Carlo distribution: median with P10 and P90. */
export const Dist = z
  .strictObject({ p10: z.number(), p50: z.number(), p90: z.number() })
  .refine((d) => d.p10 <= d.p50 && d.p50 <= d.p90, { message: "Expected p10 <= p50 <= p90" });

/** 24 hourly shares (index 0 = 00:00–00:59) that sum to 1. */
export const Profile24 = z
  .array(Share)
  .length(24)
  .refine((p) => Math.abs(p.reduce((sum, x) => sum + x, 0) - 1) < 1e-3, {
    message: "Hourly shares must sum to 1",
  });

export const DateRange = z
  .strictObject({ start: IsoDate, end: IsoDate })
  .refine((r) => r.start <= r.end, { message: "start must not be after end" });

/** Fields that every artefact carries. */
export const Header = z.strictObject({
  contractVersion: z.literal(CONTRACT_VERSION),
  generatedAt: z.iso.datetime({ offset: true }),
  generator: z.string().min(1),
  seed: z.number().int().nullable(),
  /** True for placeholder data. The UI must show a "PLACEHOLDER DATA" banner whenever this is true. */
  isFixture: z.boolean(),
  provenance: Provenance,
  /** Source ids, resolved through meta.json `sourcesCatalog`. */
  sources: z.array(Id),
});
export type Header = z.infer<typeof Header>;

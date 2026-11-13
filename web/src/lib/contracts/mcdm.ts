/**
 * Multi-criteria procurement contract: mcdm.json (implementation-plan.md §2.4 and §5).
 */
import { z } from "zod";
import { Header, Id, NonNegative, Share } from "./common";
import { Mode } from "./reference";

export const CriterionType = z.enum(["benefit", "cost"]);

export const Criterion = z.strictObject({
  id: Id,
  label: z.string().min(1),
  type: CriterionType,
  unit: z.string().min(1),
  description: z.string().min(1),
});

export const Archetype = z.enum(["local_farm", "gcc_overland", "sea_import", "air_import"]);

export const Supplier = z.strictObject({
  id: Id,
  name: z.string().min(1),
  archetype: Archetype,
  origin: z.string().min(1),
  mode: Mode,
  routeId: Id,
  chokepoints: z.array(Id),
  /** Daily capacity in kg. */
  capacityPerDay: NonNegative,
  /** One value per criterion id. */
  metrics: z.record(Id, z.number()),
});

export const Adjustment = z.strictObject({
  supplierId: Id,
  criterionId: Id,
  op: z.enum(["multiply", "add"]),
  value: z.number(),
});

export const McdmScenario = z.strictObject({
  id: Id,
  label: z.string().min(1),
  description: z.string().min(1),
  adjustments: z.array(Adjustment),
});

/** Saaty random index for n = 1..10, used to check the AHP consistency ratio. */
export const SAATY_RANDOM_INDEX = [0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49] as const;

export const McdmFile = Header.extend({
  criteria: z.array(Criterion).min(2),
  ahp: z.strictObject({
    /** n × n pairwise comparison matrix on Saaty's 1–9 scale (reciprocal). */
    matrix: z.array(z.array(z.number().positive())),
    weights: z.array(Share),
    lambdaMax: z.number(),
    ci: z.number(),
    cr: z.number(),
    ri: z.number(),
  }),
  entropyWeights: z.array(Share),
  suppliers: z.array(Supplier).min(2),
  scenarios: z.array(McdmScenario),
}).superRefine((file, ctx) => {
  const n = file.criteria.length;
  const criterionIds = new Set(file.criteria.map((c) => c.id));
  const supplierIds = new Set(file.suppliers.map((s) => s.id));
  if (file.ahp.matrix.length !== n || file.ahp.matrix.some((row) => row.length !== n)) {
    ctx.addIssue({ code: "custom", path: ["ahp", "matrix"], message: `Matrix must be ${n} × ${n}` });
  } else {
    file.ahp.matrix.forEach((row, i) =>
      row.forEach((value, j) => {
        if (Math.abs(value * file.ahp.matrix[j][i] - 1) > 1e-6) {
          ctx.addIssue({ code: "custom", path: ["ahp", "matrix", i, j], message: "Matrix must be reciprocal (a_ij × a_ji = 1)" });
        }
      }),
    );
  }
  const sums: Array<[string, number[]]> = [["weights", file.ahp.weights], ["entropyWeights", file.entropyWeights]];
  for (const [name, weights] of sums) {
    if (weights.length !== n) {
      ctx.addIssue({ code: "custom", path: [name], message: `Expected ${n} weights` });
    } else if (Math.abs(weights.reduce((s, w) => s + w, 0) - 1) > 1e-3) {
      ctx.addIssue({ code: "custom", path: [name], message: "Weights must sum to 1" });
    }
  }
  file.suppliers.forEach((supplier, i) => {
    const keys = Object.keys(supplier.metrics);
    if (keys.length !== n || keys.some((k) => !criterionIds.has(k))) {
      ctx.addIssue({ code: "custom", path: ["suppliers", i, "metrics"], message: "Metrics must have exactly one value per criterion" });
    }
  });
  file.scenarios.forEach((scenario, i) =>
    scenario.adjustments.forEach((adj, j) => {
      if (!supplierIds.has(adj.supplierId) || !criterionIds.has(adj.criterionId)) {
        ctx.addIssue({ code: "custom", path: ["scenarios", i, "adjustments", j], message: "Unknown supplier or criterion" });
      }
    }),
  );
});
export type McdmFile = z.infer<typeof McdmFile>;

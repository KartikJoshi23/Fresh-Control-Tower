/**
 * Contract tests: every artefact in public/data matches its contract, and the contracts reject
 * the mistakes they exist to catch (wrong version, unknown keys, broken cross-references).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CatalogFile,
  CONTRACT_VERSION,
  contractFor,
  Dist,
  FILE_CONTRACTS,
  McdmFile,
  Profile24,
  SeriesFile,
} from "@/lib/contracts";

const dataDir = fileURLToPath(new URL("../public/data/", import.meta.url));

function listJson(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listJson(full);
    return name.endsWith(".json") ? [relative(dataDir, full).replace(/\\/g, "/")] : [];
  });
}

function load(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dataDir, rel), "utf8"));
}

const files = listJson(dataDir);

describe("artefacts in public/data", () => {
  it("include every fixed contract file and at least one series file", () => {
    for (const path of Object.keys(FILE_CONTRACTS)) expect(files).toContain(path);
    expect(files.some((f) => f.startsWith("series/"))).toBe(true);
  });

  it.each(files)("%s matches its contract", (rel) => {
    const schema = contractFor(rel);
    expect(schema, `no contract for ${rel}`).not.toBeNull();
    const result = schema!.safeParse(load(rel));
    if (!result.success) throw new Error(JSON.stringify(result.error.issues, null, 2));
    expect((result.data as { contractVersion: string }).contractVersion).toBe(CONTRACT_VERSION);
  });
});

describe("contracts reject invalid data", () => {
  it("rejects a different contract version", () => {
    const catalog = { ...load("catalog.json"), contractVersion: "0.9.0" };
    expect(CatalogFile.safeParse(catalog).success).toBe(false);
  });

  it("rejects unknown keys (objects are strict)", () => {
    const catalog = { ...load("catalog.json"), surprise: true };
    expect(CatalogFile.safeParse(catalog).success).toBe(false);
  });

  it("rejects hero series that point at unknown stores", () => {
    const catalog = { ...load("catalog.json"), heroSeries: [{ storeId: "nowhere", skuId: "lettuce-romaine" }] };
    expect(CatalogFile.safeParse(catalog).success).toBe(false);
  });

  it("rejects series rows whose dates are not strictly increasing", () => {
    const series = load("series/dxb-marina__lettuce-romaine.json") as { rows: Array<{ date: string }> };
    const rows = [...series.rows];
    rows[1] = { ...rows[1], date: rows[0].date };
    expect(SeriesFile.safeParse({ ...series, rows }).success).toBe(false);
  });

  it("rejects AHP weights that do not sum to 1", () => {
    const mcdm = load("mcdm.json") as { ahp: { weights: number[] } };
    const ahp = { ...mcdm.ahp, weights: mcdm.ahp.weights.map(() => 0.2) };
    expect(McdmFile.safeParse({ ...mcdm, ahp }).success).toBe(false);
  });

  it("rejects a non-reciprocal AHP matrix", () => {
    const mcdm = load("mcdm.json") as { ahp: { matrix: number[][] } };
    const matrix = mcdm.ahp.matrix.map((row) => [...row]);
    matrix[0][1] = matrix[0][1] * 2; // a_10 is unchanged, so a_01 × a_10 = 2 ≠ 1 (holds for any valid matrix)
    expect(McdmFile.safeParse({ ...mcdm, ahp: { ...mcdm.ahp, matrix } }).success).toBe(false);
  });

  it("rejects crossed quantiles and profiles that do not sum to 1", () => {
    expect(Dist.safeParse({ p10: 5, p50: 4, p90: 6 }).success).toBe(false);
    expect(Profile24.safeParse(new Array(24).fill(0.05)).success).toBe(false);
  });

  it("resolves contracts by path and refuses unknown paths", () => {
    expect(contractFor("series/dxb-marina__lettuce-romaine.json")).toBe(SeriesFile);
    expect(contractFor("series\\dxb-marina__lettuce-romaine.json")).toBe(SeriesFile);
    expect(contractFor("unknown.json")).toBeNull();
  });
});

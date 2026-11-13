/**
 * Data contract registry (implementation-plan.md §2.4).
 *
 * Every file in web/public/data must match exactly one contract below.
 * Validate with `npm run data:validate` (TypeScript) and `pytest pipeline` (Python, via the
 * JSON Schemas in docs/contracts/).
 */
import type { z } from "zod";
import { LiveFeedFile } from "./live";
import { McdmFile } from "./mcdm";
import { CalendarFile, CatalogFile, MetaFile, RoutesFile, WeatherFile } from "./reference";
import { AblationFile, BacktestFile, FrontierFile, ImpactFile, RealDataFile } from "./results";
import { SeriesFile } from "./series";

export * from "./common";
export * from "./live";
export * from "./mcdm";
export * from "./reference";
export * from "./results";
export * from "./series";

/** Fixed artefact paths (relative to web/public/data) and their contracts. */
export const FILE_CONTRACTS = {
  "meta.json": MetaFile,
  "catalog.json": CatalogFile,
  "calendar.json": CalendarFile,
  "weather.json": WeatherFile,
  "backtest.json": BacktestFile,
  "frontier.json": FrontierFile,
  "realdata.json": RealDataFile,
  "ablation.json": AblationFile,
  "mcdm.json": McdmFile,
  "routes.json": RoutesFile,
  "impact.json": ImpactFile,
  "live/feed.json": LiveFeedFile,
} as const satisfies Record<string, z.ZodType>;

export type ContractPath = keyof typeof FILE_CONTRACTS;

/** Series files: series/{storeId}__{skuId}.json */
export const SERIES_FILE_PATTERN = /^series\/[a-z0-9][a-z0-9_-]*__[a-z0-9][a-z0-9_-]*\.json$/;

/** Returns the contract for a path relative to web/public/data, or null if none applies. */
export function contractFor(relativePath: string): z.ZodType | null {
  const path = relativePath.replace(/\\/g, "/");
  if (Object.hasOwn(FILE_CONTRACTS, path)) return FILE_CONTRACTS[path as ContractPath];
  if (SERIES_FILE_PATTERN.test(path)) return SeriesFile;
  return null;
}

/** Contracts exported as JSON Schema to docs/contracts/{name}.schema.json. */
export const SCHEMA_EXPORTS: Record<string, z.ZodType> = {
  meta: MetaFile,
  catalog: CatalogFile,
  calendar: CalendarFile,
  weather: WeatherFile,
  series: SeriesFile,
  "live-feed": LiveFeedFile,
  backtest: BacktestFile,
  frontier: FrontierFile,
  realdata: RealDataFile,
  ablation: AblationFile,
  mcdm: McdmFile,
  routes: RoutesFile,
  impact: ImpactFile,
};

/**
 * Data loading for the static artefacts in public/data (implementation-plan.md §2.4).
 *
 * `loadArtefact` fetches one file, validates it against its Zod contract and returns a result object.
 * It never throws and never logs: a failed fetch, bad JSON or a contract violation becomes
 * { status: "error" }, which the page renders as an error panel (definition of done, Part 5).
 * Results are cached per path for the session, and every loaded file's `isFixture` flag is reported to
 * the fixture registry, so the PLACEHOLDER DATA banner appears whenever any of them is a fixture.
 */
import type { z } from "zod";

import { FILE_CONTRACTS, type ContractPath, SeriesFile } from "@/lib/contracts";

export type LoadResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty"; reason: string }
  | { status: "error"; message: string; detail?: string };

export const DATA_ROOT = "/data";

// --- Fixture registry (read by the PlaceholderBanner) --------------------------------------------------------

type Listener = () => void;
const fixtures = new Set<string>();
const listeners = new Set<Listener>();

export function reportFixture(path: string, isFixture: boolean): void {
  const had = fixtures.has(path);
  if (isFixture) fixtures.add(path);
  else fixtures.delete(path);
  if (had !== isFixture) listeners.forEach((l) => l());
}

export function fixturePaths(): string[] {
  return [...fixtures].sort();
}

export function subscribeFixtures(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- Loading -------------------------------------------------------------------------------------------------

const cache = new Map<string, Promise<LoadResult<unknown>>>();

/** Clear the cache and the registry (tests only). */
export function resetDataCache(): void {
  cache.clear();
  fixtures.clear();
}

function summarise(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** Fetch and validate `path` (relative to public/data) against `schema`. */
export async function loadWith<T>(path: string, schema: z.ZodType<T>, fetcher: typeof fetch = fetch): Promise<LoadResult<T>> {
  let response: Response;
  try {
    response = await fetcher(`${DATA_ROOT}/${path}`);
  } catch {
    return { status: "error", message: `Could not reach ${path}.`, detail: "Network error" };
  }
  if (response.status === 404) return { status: "empty", reason: `${path} has not been published yet.` };
  if (!response.ok) return { status: "error", message: `Could not load ${path}.`, detail: `HTTP ${response.status}` };
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { status: "error", message: `${path} is not valid JSON.` };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { status: "error", message: `${path} does not match its data contract.`, detail: summarise(parsed.error) };
  }
  const data = parsed.data as T & { isFixture?: boolean };
  reportFixture(path, Boolean(data.isFixture));
  return { status: "ok", data };
}

type ContractOf<P extends ContractPath> = z.infer<(typeof FILE_CONTRACTS)[P]>;

/** Load one of the fixed artefacts (meta.json, catalog.json, …), cached for the session. */
export function loadArtefact<P extends ContractPath>(path: P): Promise<LoadResult<ContractOf<P>>> {
  if (!cache.has(path)) cache.set(path, loadWith(path, FILE_CONTRACTS[path] as unknown as z.ZodType<ContractOf<P>>));
  return cache.get(path) as Promise<LoadResult<ContractOf<P>>>;
}

export function seriesPath(storeId: string, skuId: string): string {
  return `series/${storeId}__${skuId}.json`;
}

/** Load one hero series file, cached for the session. */
export function loadSeries(storeId: string, skuId: string): Promise<LoadResult<z.infer<typeof SeriesFile>>> {
  const path = seriesPath(storeId, skuId);
  if (!cache.has(path)) cache.set(path, loadWith(path, SeriesFile));
  return cache.get(path) as Promise<LoadResult<z.infer<typeof SeriesFile>>>;
}

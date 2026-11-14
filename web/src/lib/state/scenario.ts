/**
 * The shared scenario (implementation-plan.md §2.5, requirement R5): types, defaults, presets and the
 * URL codec. Pure functions only, so every rule here is unit-tested (tests/scenario.test.ts).
 *
 * One scenario drives every page. Its non-default values are mirrored into the URL query string, so a
 * scenario can be shared as a link. Each field has a short, stable query key and a parser that clamps
 * values to their allowed range; unknown or invalid parameters are ignored, never thrown.
 */

export type PolicyId = "P0" | "P1" | "P2" | "P3";
export type DisruptionPreset = "none" | "hormuz2026";
export type WeightMode = "ahp" | "entropy" | "custom";
/** The date window pages focus on: the backtest windows of backtest.json (Part 4). */
export const WINDOWS = ["test-2026", "normal", "ramadan-2026", "stockpiling", "hormuz", "summer"] as const;
export type WindowId = (typeof WINDOWS)[number];
export const WINDOW_LABELS: Record<WindowId, string> = {
  "test-2026": "Test window 2026 (Jan–Oct)",
  normal: "Normal weeks (Jan–Feb 2026)",
  "ramadan-2026": "Ramadan 2026",
  stockpiling: "Stockpiling spike (1–7 Mar 2026)",
  hormuz: "Hormuz 2026 (Mar–May)",
  summer: "Summer 2026",
};

export interface ScenarioState {
  selection: { storeId: string; skuId: string; window: WindowId };
  demand: { demandMultiplier: number; ordersPerDay: number | null };
  spike: { enabled: boolean; date: string; magnitude: number; durationDays: number; warningDays: number };
  calendar: { ramadanIntensity: number; eidIntensity: number; nationalDay: boolean; summerSeason: boolean };
  weather: { heatwave: boolean; heatwaveDeltaC: number };
  supply: {
    disruptionPreset: DisruptionPreset;
    seaLeadTimeMultiplier: number;
    reliabilityDrop: number;
    freightIncrease: number;
    supplierOutage: string | null;
  };
  policy: {
    policy: PolicyId;
    /** null = "auto" (each SKU's optimised τ); otherwise one manual service quantile. */
    serviceTarget: number | null;
    useDemandRecovery: boolean;
    foodRescue: boolean;
    manualOrderDay: number | null;
    manualOrderQty: number | null;
  };
  sourcing: { weightMode: WeightMode };
  ui: { liveSpeed: number; tableView: boolean };
}

export const DEFAULT_SCENARIO: ScenarioState = {
  selection: { storeId: "dxb-marina", skuId: "lettuce-romaine", window: "test-2026" },
  demand: { demandMultiplier: 1, ordersPerDay: null },
  spike: { enabled: false, date: "2026-02-21", magnitude: 2.5, durationDays: 3, warningDays: 0 },
  calendar: { ramadanIntensity: 100, eidIntensity: 100, nationalDay: true, summerSeason: true },
  weather: { heatwave: false, heatwaveDeltaC: 4 },
  supply: {
    disruptionPreset: "none",
    seaLeadTimeMultiplier: 1,
    reliabilityDrop: 0,
    freightIncrease: 0,
    supplierOutage: null,
  },
  policy: {
    policy: "P3",
    serviceTarget: null,
    useDemandRecovery: true,
    foodRescue: false,
    manualOrderDay: null,
    manualOrderQty: null,
  },
  sourcing: { weightMode: "ahp" },
  ui: { liveSpeed: 60, tableView: false },
};

// --- Field table: one row per URL-synced field -------------------------------------------------------------

type Kind =
  | { type: "number"; min: number; max: number; nullable?: boolean; integer?: boolean }
  | { type: "boolean" }
  | { type: "date" }
  | { type: "id"; nullable?: boolean }
  | { type: "enum"; options: readonly string[] };

export interface Field {
  /** Dotted path into ScenarioState, for example "demand.demandMultiplier". */
  path: string;
  /** Short query-string key. Never rename one: shared links depend on it. */
  key: string;
  kind: Kind;
}

export const FIELDS: readonly Field[] = [
  { path: "selection.storeId", key: "store", kind: { type: "id" } },
  { path: "selection.skuId", key: "sku", kind: { type: "id" } },
  { path: "selection.window", key: "win", kind: { type: "enum", options: WINDOWS } },
  { path: "demand.demandMultiplier", key: "dm", kind: { type: "number", min: 0.5, max: 3 } },
  { path: "demand.ordersPerDay", key: "opd", kind: { type: "number", min: 0, max: 5000, nullable: true } },
  { path: "spike.enabled", key: "sp", kind: { type: "boolean" } },
  { path: "spike.date", key: "spd", kind: { type: "date" } },
  { path: "spike.magnitude", key: "spm", kind: { type: "number", min: 1.2, max: 5 } },
  { path: "spike.durationDays", key: "spl", kind: { type: "number", min: 1, max: 14, integer: true } },
  { path: "spike.warningDays", key: "spw", kind: { type: "number", min: 0, max: 21, integer: true } },
  { path: "calendar.ramadanIntensity", key: "ram", kind: { type: "number", min: 0, max: 150, integer: true } },
  { path: "calendar.eidIntensity", key: "eid", kind: { type: "number", min: 0, max: 150, integer: true } },
  { path: "calendar.nationalDay", key: "nd", kind: { type: "boolean" } },
  { path: "calendar.summerSeason", key: "sum", kind: { type: "boolean" } },
  { path: "weather.heatwave", key: "hw", kind: { type: "boolean" } },
  { path: "weather.heatwaveDeltaC", key: "hwc", kind: { type: "number", min: 1, max: 8 } },
  { path: "supply.disruptionPreset", key: "dis", kind: { type: "enum", options: ["none", "hormuz2026"] } },
  { path: "supply.seaLeadTimeMultiplier", key: "slt", kind: { type: "number", min: 1, max: 3 } },
  { path: "supply.reliabilityDrop", key: "rel", kind: { type: "number", min: 0, max: 50, integer: true } },
  { path: "supply.freightIncrease", key: "frt", kind: { type: "number", min: 0, max: 100, integer: true } },
  { path: "supply.supplierOutage", key: "out", kind: { type: "id", nullable: true } },
  { path: "policy.policy", key: "pol", kind: { type: "enum", options: ["P0", "P1", "P2", "P3"] } },
  { path: "policy.serviceTarget", key: "tau", kind: { type: "number", min: 0.5, max: 0.99, nullable: true } },
  { path: "policy.useDemandRecovery", key: "rec", kind: { type: "boolean" } },
  { path: "policy.foodRescue", key: "fr", kind: { type: "boolean" } },
  { path: "policy.manualOrderDay", key: "mod", kind: { type: "number", min: 0, max: 34, nullable: true, integer: true } },
  { path: "policy.manualOrderQty", key: "moq", kind: { type: "number", min: 0, max: 10000, nullable: true, integer: true } },
  { path: "sourcing.weightMode", key: "w", kind: { type: "enum", options: ["ahp", "entropy", "custom"] } },
  { path: "ui.tableView", key: "tv", kind: { type: "boolean" } },
];

const ID = /^[a-z0-9][a-z0-9_-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function getPath(state: ScenarioState, path: string): unknown {
  return path.split(".").reduce<unknown>((obj, key) => (obj as Record<string, unknown>)[key], state);
}

/** A copy of `state` with `path` set to `value` (structural sharing; the input is never mutated). */
export function setPath(state: ScenarioState, path: string, value: unknown): ScenarioState {
  const [group, field] = path.split(".") as [keyof ScenarioState, string];
  return { ...state, [group]: { ...state[group], [field]: value } };
}

/** Parse one raw query value for a field; undefined means "invalid, ignore it". */
export function parseValue(kind: Kind, raw: string): unknown {
  switch (kind.type) {
    case "boolean":
      return raw === "1" ? true : raw === "0" ? false : undefined;
    case "number": {
      if (kind.nullable && raw === "auto") return null;
      const n = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(n)) return undefined;
      const clamped = Math.min(kind.max, Math.max(kind.min, n));
      return kind.integer ? Math.round(clamped) : clamped;
    }
    case "date":
      return DATE.test(raw) ? raw : undefined;
    case "id":
      if (kind.nullable && raw === "none") return null;
      return ID.test(raw) ? raw : undefined;
    case "enum":
      return kind.options.includes(raw) ? raw : undefined;
  }
}

export function formatValue(kind: Kind, value: unknown): string {
  if (value === null) return kind.type === "number" ? "auto" : "none";
  if (kind.type === "boolean") return value ? "1" : "0";
  if (kind.type === "number") return String(Math.round((value as number) * 1000) / 1000);
  return String(value);
}

/** Query string (without "?") holding only the fields that differ from the defaults. */
export function encodeScenario(state: ScenarioState): string {
  const params = new URLSearchParams();
  for (const f of FIELDS) {
    const value = getPath(state, f.path);
    if (value !== getPath(DEFAULT_SCENARIO, f.path)) params.set(f.key, formatValue(f.kind, value));
  }
  return params.toString();
}

/** The defaults overlaid with every valid parameter in `search`. Never throws. */
export function decodeScenario(search: string | URLSearchParams): ScenarioState {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  let state = DEFAULT_SCENARIO;
  for (const f of FIELDS) {
    const raw = params.get(f.key);
    if (raw === null) continue;
    const value = parseValue(f.kind, raw);
    if (value !== undefined) state = setPath(state, f.path, value);
  }
  return state;
}

// --- Presets (docs/design-system.md: Normal · Ramadan 2026 · 200→500 Spike · Hormuz 2026 · Heatwave) ----------

export interface Preset {
  id: string;
  label: string;
  description: string;
  apply: (state: ScenarioState) => ScenarioState;
}

/** Presets keep the store-SKU and UI settings, set their window and reset everything else, so they never stack. */
function fresh(state: ScenarioState, window: WindowId): ScenarioState {
  return { ...DEFAULT_SCENARIO, selection: { ...state.selection, window }, ui: state.ui };
}

export const PRESETS: readonly Preset[] = [
  { id: "normal", label: "Normal", description: "Ordinary weeks (Jan–Feb 2026): forecast demand, no events, no disruption.",
    apply: (s) => fresh(s, "normal") },
  {
    id: "ramadan-2026",
    label: "Ramadan 2026",
    description: "Ramadan from 18 Feb 2026 at the calibrated intensity, with Eid al-Fitr.",
    apply: (s) => {
      const base = fresh(s, "ramadan-2026");
      return { ...base, calendar: { ...base.calendar, ramadanIntensity: 100, eidIntensity: 100 } };
    },
  },
  {
    id: "spike-200-500",
    label: "200→500 Spike",
    description: "Orders jump from 200 to 500 a day (2.5×) for 3 days, unannounced.",
    apply: (s) => {
      const base = fresh(s, "stockpiling");
      return {
        ...base,
        demand: { ...base.demand, ordersPerDay: 200 },
        spike: { ...base.spike, enabled: true, magnitude: 2.5, durationDays: 3, warningDays: 0 },
      };
    },
  },
  {
    id: "hormuz-2026",
    label: "Hormuz 2026",
    description: "Sea and air imports through the Hormuz disruption (Mar–May 2026): slower, less reliable.",
    apply: (s) => {
      const base = fresh(s, "hormuz");
      return {
        ...base,
        supply: { ...base.supply, disruptionPreset: "hormuz2026", seaLeadTimeMultiplier: 2, reliabilityDrop: 30 },
      };
    },
  },
  {
    id: "heatwave",
    label: "Heatwave",
    description: "A +4 °C heatwave on top of the seasonal norm.",
    apply: (s) => {
      const base = fresh(s, "summer");
      return { ...base, weather: { heatwave: true, heatwaveDeltaC: 4 } };
    },
  },
];

/** The preset whose result equals `state` (ignoring the store-SKU and UI), or null for a custom scenario. */
export function matchingPreset(state: ScenarioState): Preset | null {
  const strip = (s: ScenarioState) =>
    encodeScenario({ ...s, selection: { ...DEFAULT_SCENARIO.selection, window: s.selection.window }, ui: DEFAULT_SCENARIO.ui });
  const key = strip(state);
  return PRESETS.find((p) => strip(p.apply(state)) === key) ?? null;
}

// --- Active-scenario chips (shown in the top bar) ------------------------------------------------------------

export function activeChips(state: ScenarioState): string[] {
  const chips: string[] = [];
  const d = DEFAULT_SCENARIO;
  if (state.selection.window !== d.selection.window) chips.push(`Window: ${WINDOW_LABELS[state.selection.window].replace(/ \(.*\)$/, "")}`);
  if (state.calendar.ramadanIntensity !== d.calendar.ramadanIntensity) chips.push(`Ramadan ${state.calendar.ramadanIntensity}%`);
  if (state.calendar.eidIntensity !== d.calendar.eidIntensity) chips.push(`Eid ${state.calendar.eidIntensity}%`);
  if (state.demand.demandMultiplier !== 1) chips.push(`Demand ${state.demand.demandMultiplier}×`);
  if (state.demand.ordersPerDay !== null) chips.push(`${state.demand.ordersPerDay}/day`);
  if (state.spike.enabled) {
    chips.push(`Spike ${state.spike.magnitude}×${state.spike.warningDays > 0 ? `, ${state.spike.warningDays} d warning` : ""}`);
  }
  if (state.supply.disruptionPreset === "hormuz2026") chips.push("Hormuz disruption");
  if (state.supply.supplierOutage) chips.push(`Outage: ${state.supply.supplierOutage}`);
  if (state.weather.heatwave) chips.push(`Heatwave +${state.weather.heatwaveDeltaC} °C`);
  if (state.policy.policy !== d.policy.policy) chips.push(`Policy ${state.policy.policy}`);
  if (state.policy.serviceTarget !== null) chips.push(`τ ${state.policy.serviceTarget}`);
  if (!state.policy.useDemandRecovery) chips.push("No recovery");
  return chips;
}

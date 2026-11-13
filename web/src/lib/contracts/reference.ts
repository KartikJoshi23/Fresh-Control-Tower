/**
 * Reference data contracts: meta, catalog, calendar, weather and routes (implementation-plan.md §2.4).
 */
import { z } from "zod";
import { DateRange, Header, Id, IsoDate, NonNegative } from "./common";

export const SourceRef = z.strictObject({
  id: Id,
  /** Short Harvard-style citation, for example "UNEP (2024)". */
  citation: z.string().min(1),
  url: z.url().nullable(),
  licence: z.string().min(1),
  accessed: IsoDate,
  /** False = flagged; it must be verified against a primary source before it reaches the report. */
  verified: z.boolean(),
});

const ProvenanceLegend = z.strictObject({
  REAL: z.string().min(1),
  CALIBRATED_SYNTHETIC: z.string().min(1),
  SCENARIO: z.string().min(1),
  SIMULATED_FEED: z.string().min(1),
  DERIVED: z.string().min(1),
  PRECOMPUTED: z.string().min(1),
});

/** meta.json: generation metadata, the sources catalogue and the provenance legend. */
export const MetaFile = Header.extend({
  project: z.literal("Fresh Control Tower"),
  operatorName: z.string().min(1),
  operatorIsFictional: z.literal(true),
  timezone: z.literal("Asia/Dubai"),
  currency: z.literal("AED"),
  horizon: DateRange,
  testWindow: DateRange,
  sourcesCatalog: z.array(SourceRef).min(1),
  provenanceLegend: ProvenanceLegend,
});
export type MetaFile = z.infer<typeof MetaFile>;

export const Emirate = z.enum(["Dubai", "Sharjah", "Abu Dhabi"]);

export const Store = z.strictObject({
  id: Id,
  name: z.string().min(1),
  area: z.string().min(1),
  emirate: Emirate,
  lat: z.number().min(22).max(27),
  lon: z.number().min(51).max(57),
  /** Relative demand scale of the store (1 = average). */
  sizeIndex: z.number().positive(),
});

export const Category = z.strictObject({
  id: Id,
  name: z.string().min(1),
  shelfLifeDays: z.strictObject({ min: z.number().int().positive(), max: z.number().int().positive() }),
});

export const SalesUnit = z.enum(["kg", "each", "pack"]);

export const Sku = z.strictObject({
  id: Id,
  name: z.string().min(1),
  categoryId: Id,
  /** Quantities everywhere are in this unit; kgPerUnit converts them to kg for waste and CO2e. */
  unit: SalesUnit,
  kgPerUnit: z.number().positive(),
  shelfLifeDays: z.number().int().positive(),
  unitCostAED: z.number().positive(),
  priceAED: z.number().positive(),
  casePack: z.number().int().positive(),
  primarySupplierId: Id,
});

export const SeriesKey = z.strictObject({ storeId: Id, skuId: Id });

/** catalog.json: stores, categories, SKUs and the hero series that have series files. */
export const CatalogFile = Header.extend({
  stores: z.array(Store).min(1),
  categories: z.array(Category).min(1),
  skus: z.array(Sku).min(1),
  heroSeries: z.array(SeriesKey).min(1),
}).superRefine((catalog, ctx) => {
  const storeIds = new Set(catalog.stores.map((s) => s.id));
  const skuIds = new Set(catalog.skus.map((s) => s.id));
  const categoryIds = new Set(catalog.categories.map((c) => c.id));
  catalog.skus.forEach((sku, i) => {
    if (!categoryIds.has(sku.categoryId)) {
      ctx.addIssue({ code: "custom", path: ["skus", i, "categoryId"], message: `Unknown category "${sku.categoryId}"` });
    }
    if (sku.priceAED <= sku.unitCostAED) {
      ctx.addIssue({ code: "custom", path: ["skus", i, "priceAED"], message: "Price must exceed unit cost" });
    }
  });
  catalog.heroSeries.forEach((hero, i) => {
    if (!storeIds.has(hero.storeId)) {
      ctx.addIssue({ code: "custom", path: ["heroSeries", i, "storeId"], message: `Unknown store "${hero.storeId}"` });
    }
    if (!skuIds.has(hero.skuId)) {
      ctx.addIssue({ code: "custom", path: ["heroSeries", i, "skuId"], message: `Unknown SKU "${hero.skuId}"` });
    }
  });
});
export type CatalogFile = z.infer<typeof CatalogFile>;

export const FestivalKind = z.enum(["religious", "national", "civic", "school", "commercial"]);

export const Festival = z.strictObject({
  id: Id,
  name: z.string().min(1),
  kind: FestivalKind,
  start: IsoDate,
  end: IsoDate,
  /** Id in meta.json sourcesCatalog (an official announcement for real festival dates). */
  sourceId: Id,
});

export const FestivalPhase = z.enum(["none", "pre", "during", "post"]);

export const CalendarDay = z.strictObject({
  date: IsoDate,
  /** 0 = Monday … 6 = Sunday (the same convention as pandas `dayofweek`). */
  weekday: z.number().int().min(0).max(6),
  isWeekend: z.boolean(),
  festivalId: Id.nullable(),
  festivalPhase: FestivalPhase,
  ramadanDay: z.number().int().min(1).max(30).nullable(),
  publicHoliday: z.boolean(),
  schoolHoliday: z.boolean(),
});

/** calendar.json: the UAE festival calendar and one row per day of the horizon. */
export const CalendarFile = Header.extend({
  festivals: z.array(Festival),
  days: z.array(CalendarDay).min(1),
});
export type CalendarFile = z.infer<typeof CalendarFile>;

export const WeatherDay = z.strictObject({
  date: IsoDate,
  emirate: Emirate,
  tMaxC: z.number().min(-10).max(60),
  tMeanC: z.number().min(-10).max(55),
  precipMm: NonNegative,
});

/** weather.json: real daily weather per emirate (Open-Meteo). */
export const WeatherFile = Header.extend({
  rows: z.array(WeatherDay).min(1),
});
export type WeatherFile = z.infer<typeof WeatherFile>;

/** Transport mode, shared by routes and suppliers. */
export const Mode = z.enum(["local_truck", "truck", "sea", "air"]);

export const PlaceKind = z.enum(["origin", "port", "hub", "store_region", "chokepoint"]);

export const Place = z.strictObject({
  id: Id,
  name: z.string().min(1),
  kind: PlaceKind,
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const Route = z.strictObject({
  id: Id,
  supplierId: Id,
  mode: Mode,
  /** Ordered waypoints from origin to the UAE. */
  placeIds: z.array(Id).min(2),
  chokepointIds: z.array(Id),
});

/** routes.json: places and supplier routes for the Route Globe. */
export const RoutesFile = Header.extend({
  places: z.array(Place).min(2),
  routes: z.array(Route).min(1),
}).superRefine((file, ctx) => {
  const places = new Map(file.places.map((p) => [p.id, p]));
  file.routes.forEach((route, i) => {
    route.placeIds.forEach((id, j) => {
      if (!places.has(id)) ctx.addIssue({ code: "custom", path: ["routes", i, "placeIds", j], message: `Unknown place "${id}"` });
    });
    route.chokepointIds.forEach((id, j) => {
      if (places.get(id)?.kind !== "chokepoint") {
        ctx.addIssue({ code: "custom", path: ["routes", i, "chokepointIds", j], message: `"${id}" is not a chokepoint place` });
      }
    });
  });
});
export type RoutesFile = z.infer<typeof RoutesFile>;

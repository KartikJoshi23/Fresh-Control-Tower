"""The fictional UAE dark-store operator: stores, categories, SKUs and supplier terms (task P2-01).

Everything here describes a FICTIONAL operator. Store locations are real UAE areas; supplier routes
are real geography (freshpipe.geography). Every parameter states its basis:

- REAL: measured from the cleaned datasets (data/processed/calibration.json) or a cited table;
- ANCHOR: set so that an aggregate matches a cited figure;
- ASSUMPTION: no public source exists; the value is stated here and can be changed;
- TUNED: chosen so that a fidelity band is met (docs/04-synthetic-world.md lists each one).

`catalog_body()` produces web/public/data/catalog.json.
"""

from __future__ import annotations

import math
import zlib
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from .geography import SUPPLIER_ROUTES
from .reference import planning_shelf_life_days

#: z-score of the 90th percentile; used to fit a log-normal to (p10, p50, p90).
Z90 = 1.2815515655446004
#: A short delivery brings this share of the ordered units (uniform). ASSUMPTION.
SHORT_FILL = (0.5, 0.9)


def rng_for(seed: int, stream: str, *extra: int) -> np.random.Generator:
    """An independent, reproducible random stream per purpose.

    Streams are keyed by name, so adding or changing one stream never shifts the draws of another.
    `extra` adds integer keys, for example a Monte Carlo run index in Part 4.
    """
    key = (zlib.crc32(stream.encode("utf-8")), *extra)
    return np.random.default_rng(np.random.SeedSequence(entropy=seed, spawn_key=key))


# --- Stores -----------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Store:
    id: str
    name: str
    area: str
    emirate: str
    lat: float
    lon: float
    size_index: float  # ASSUMPTION: relative demand scale of the store (about 1 = average)


#: Real areas (coordinates are area centroids rounded to 0.01°); the stores themselves are fictional.
STORES: tuple[Store, ...] = (
    Store("dxb-marina", "Dark store Marina (fictional)", "Dubai Marina", "Dubai", 25.08, 55.14, 1.20),
    Store("dxb-barsha", "Dark store Al Barsha (fictional)", "Al Barsha", "Dubai", 25.11, 55.20, 1.00),
    Store("dxb-deira", "Dark store Deira (fictional)", "Deira", "Dubai", 25.27, 55.31, 1.10),
    Store("dxb-business-bay", "Dark store Business Bay (fictional)", "Business Bay", "Dubai", 25.19, 55.27, 0.95),
    Store("dxb-jvc", "Dark store JVC (fictional)", "Jumeirah Village Circle", "Dubai", 25.06, 55.21, 0.85),
    Store("shj-nahda", "Dark store Al Nahda (fictional)", "Al Nahda", "Sharjah", 25.30, 55.37, 0.90),
    Store("auh-reem", "Dark store Al Reem (fictional)", "Al Reem Island", "Abu Dhabi", 24.50, 54.40, 1.10),
    Store("auh-khalifa", "Dark store Khalifa City (fictional)", "Khalifa City", "Abu Dhabi", 24.42, 54.58, 0.80),
)


# --- Categories ---------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Category:
    id: str
    name: str
    # ASSUMPTION: relative strength of each event for the category (1 = average basket).
    ramadan_weight: float
    adha_weight: float
    stockpile_weight: float
    # Share of received units culled for quality on receipt (handling loss). For the two vegetable
    # categories it is TUNED so that total baseline spoilage matches the real Kaggle loss rates; for
    # the others it is an ASSUMPTION (the real data covers vegetables only).
    handling_loss: float
    handling_basis: str


CATEGORIES: tuple[Category, ...] = (
    Category("leafy-greens", "Leafy greens and herbs", 1.2, 1.2, 0.6, 0.124, "tuned"),
    Category("berries", "Berries", 0.7, 0.8, 0.6, 0.06, "assumption"),
    Category("stone-fruit", "Stone fruit", 0.9, 0.8, 0.6, 0.04, "assumption"),
    Category("salad-vegetables", "Salad vegetables", 1.1, 1.2, 0.6, 0.076, "tuned"),
    Category("dairy", "Dairy and laban", 1.5, 1.0, 1.0, 0.01, "assumption"),
    Category("bakery", "Bakery and khubz", 1.3, 1.2, 0.8, 0.02, "assumption"),
    Category("poultry", "Fresh poultry", 1.2, 2.0, 0.8, 0.015, "assumption"),
    Category("dates", "Dates", 3.0, 0.8, 1.0, 0.01, "assumption"),
    Category("fruit", "Fruit (bananas, apples, citrus)", 1.3, 1.0, 1.0, 0.03, "assumption"),
)


# --- SKUs -----------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Sku:
    id: str
    name: str
    category_id: str
    shelf_category: str      # key into data/external/shelf_life.csv (planning days from receipt, REAL/ASSUMPTION there)
    unit: str                # kg | each | pack
    kg_per_unit: float
    price_aed: float         # ASSUMPTION: plausible UAE online-grocery shelf price
    case_pack: int           # ASSUMPTION: supplier case size (order multiple)
    supplier_id: str         # primary supplier (the baseline policy orders only from it)
    base_daily: float        # ASSUMPTION: units per day in an average store on an ordinary weekday-mix day
    reference: str | None    # Kaggle vegetable category used for the markup (and loss target); None = overall


LEAF = "Flower/Leaf Vegetables"
SKUS: tuple[Sku, ...] = (
    # Leafy greens and herbs
    Sku("lettuce-romaine", "Romaine lettuce", "leafy-greens", "leafy-greens", "each", 0.35, 6.50, 12, "sup-local-farm", 36, LEAF),
    Sku("salad-leaves-150g", "Mixed salad leaves 150 g", "leafy-greens", "leafy-greens", "pack", 0.15, 9.75, 10, "sup-local-farm", 28, LEAF),
    Sku("rocket-125g", "Rocket 125 g", "leafy-greens", "leafy-greens", "pack", 0.125, 8.25, 10, "sup-local-farm", 18, LEAF),
    Sku("spinach-bunch", "Spinach bunch", "leafy-greens", "leafy-greens", "each", 0.25, 4.95, 12, "sup-local-farm", 22, LEAF),
    Sku("mint-bunch", "Mint bunch", "leafy-greens", "leafy-greens", "each", 0.10, 2.75, 20, "sup-local-farm", 45, LEAF),
    Sku("coriander-bunch", "Coriander bunch", "leafy-greens", "leafy-greens", "each", 0.10, 2.50, 20, "sup-gcc-truck", 38, LEAF),
    Sku("parsley-bunch", "Parsley bunch", "leafy-greens", "leafy-greens", "each", 0.10, 2.50, 20, "sup-gcc-truck", 34, LEAF),
    # Berries
    Sku("strawberries-250g", "Strawberries 250 g", "berries", "berries", "pack", 0.25, 14.95, 8, "sup-air-europe", 30, None),
    Sku("blueberries-125g", "Blueberries 125 g", "berries", "berries", "pack", 0.125, 12.95, 12, "sup-air-import", 26, None),
    Sku("raspberries-125g", "Raspberries 125 g", "berries", "berries", "pack", 0.125, 15.95, 6, "sup-air-europe", 12, None),
    # Stone fruit
    Sku("peaches-1kg", "Peaches 1 kg", "stone-fruit", "stone-fruit", "pack", 1.0, 16.50, 4, "sup-sea-europe", 10, None),
    Sku("nectarines-1kg", "Nectarines 1 kg", "stone-fruit", "stone-fruit", "pack", 1.0, 16.95, 4, "sup-sea-europe", 8, None),
    Sku("plums-500g", "Plums 500 g", "stone-fruit", "stone-fruit", "pack", 0.5, 9.95, 6, "sup-sea-import", 9, None),
    Sku("apricots-500g", "Apricots 500 g", "stone-fruit", "stone-fruit", "pack", 0.5, 13.95, 6, "sup-air-europe", 7, None),
    # Salad vegetables
    Sku("tomatoes-1kg", "Tomatoes", "salad-vegetables", "salad-vegetables", "kg", 1.0, 6.95, 10, "sup-gcc-ksa", 70, "Solanum"),
    Sku("cucumbers-1kg", "Cucumbers", "salad-vegetables", "salad-vegetables", "kg", 1.0, 5.95, 10, "sup-local-farm", 60, None),
    Sku("cherry-tomatoes-250g", "Cherry tomatoes 250 g", "salad-vegetables", "salad-vegetables", "pack", 0.25, 7.95, 12, "sup-local-farm", 34, "Solanum"),
    Sku("bell-peppers-500g", "Mixed bell peppers 500 g", "salad-vegetables", "salad-vegetables", "pack", 0.5, 9.50, 10, "sup-gcc-truck", 26, "Capsicum"),
    Sku("mushrooms-250g", "White mushrooms 250 g", "salad-vegetables", "salad-vegetables", "pack", 0.25, 7.25, 12, "sup-local-farm", 24, "Edible Mushroom"),
    Sku("aubergine-1kg", "Aubergine", "salad-vegetables", "salad-vegetables", "kg", 1.0, 6.50, 10, "sup-gcc-ksa", 18, "Solanum"),
    # Dairy and laban
    Sku("laban-1l", "Laban 1 L", "dairy", "dairy", "each", 1.03, 6.25, 12, "sup-gcc-ksa", 80, None),
    Sku("fresh-milk-2l", "Fresh milk 2 L", "dairy", "dairy", "each", 2.06, 11.50, 6, "sup-gcc-ksa", 120, None),
    Sku("yoghurt-1kg", "Plain yoghurt 1 kg", "dairy", "dairy", "each", 1.0, 9.75, 6, "sup-gcc-ksa", 45, None),
    Sku("labneh-400g", "Labneh 400 g", "dairy", "dairy", "each", 0.4, 12.50, 12, "sup-gcc-truck", 30, None),
    Sku("fresh-cream-500ml", "Fresh cream 500 ml", "dairy", "dairy", "each", 0.5, 10.95, 12, "sup-gcc-ksa", 16, None),
    # Bakery and khubz
    Sku("khubz-arabic", "Arabic bread (khubz), 6 pieces", "bakery", "bakery", "pack", 0.4, 3.50, 20, "sup-local-bakery", 210, None),
    Sku("white-bread-600g", "White sliced bread 600 g", "bakery", "bakery", "each", 0.6, 6.75, 12, "sup-local-bakery", 70, None),
    Sku("wholemeal-bread-600g", "Wholemeal bread 600 g", "bakery", "bakery", "each", 0.6, 7.95, 12, "sup-local-bakery", 40, None),
    Sku("croissants-4pk", "Croissants, 4 pieces", "bakery", "bakery", "pack", 0.24, 12.95, 10, "sup-local-bakery", 25, None),
    # Fresh poultry
    Sku("chicken-whole-1kg", "Fresh whole chicken 1 kg", "poultry", "poultry", "each", 1.0, 19.95, 6, "sup-gcc-ksa", 40, None),
    Sku("chicken-breast-500g", "Fresh chicken breast 500 g", "poultry", "poultry", "pack", 0.5, 22.50, 8, "sup-gcc-ksa", 45, None),
    Sku("chicken-thighs-1kg", "Fresh chicken thighs 1 kg", "poultry", "poultry", "pack", 1.0, 21.95, 6, "sup-gcc-truck", 22, None),
    # Dates
    Sku("dates-khalas-500g", "Khalas dates 500 g", "dates", "dates", "pack", 0.5, 14.95, 10, "sup-gcc-ksa", 20, None),
    Sku("dates-sukkari-500g", "Sukkari dates 500 g", "dates", "dates", "pack", 0.5, 22.95, 10, "sup-gcc-ksa", 14, None),
    Sku("dates-medjool-500g", "Medjool dates 500 g", "dates", "dates", "pack", 0.5, 39.95, 6, "sup-gcc-truck", 8, None),
    # Fruit
    Sku("bananas-1kg", "Bananas", "fruit", "bananas", "kg", 1.0, 6.95, 12, "sup-sea-import", 200, None),
    Sku("apples-red-1kg", "Red apples", "fruit", "apples", "kg", 1.0, 9.95, 12, "sup-sea-europe", 55, None),
    Sku("apples-green-1kg", "Green apples", "fruit", "apples", "kg", 1.0, 10.50, 12, "sup-sea-europe", 30, None),
    Sku("oranges-1kg", "Oranges", "fruit", "citrus", "kg", 1.0, 7.95, 12, "sup-sea-khorfakkan", 50, None),
    Sku("limes-500g", "Limes 500 g", "fruit", "citrus", "pack", 0.5, 5.50, 20, "sup-sea-import", 38, None),
)

#: Hero series: 4 stores × 10 SKUs get series files and appear in the Scenario Console picker.
HERO_STORES = ("dxb-marina", "dxb-deira", "shj-nahda", "auh-reem")
HERO_SKUS = ("lettuce-romaine", "mint-bunch", "strawberries-250g", "peaches-1kg", "tomatoes-1kg",
             "laban-1l", "khubz-arabic", "chicken-whole-1kg", "dates-khalas-500g", "bananas-1kg")


# --- Suppliers ------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class SupplyTerms:
    """Delivery behaviour seen by a store. ASSUMPTION unless noted; the outage-related values are TUNED.

    Orders are placed at the nightly review (22:00) and delivered at dawn (06:00) `lead_time_days`
    later. Each delivery is on time, one day late (`p_late`) or two days late (`p_late2`), or it never
    comes (`p_miss`). A delivery that comes is short with probability `p_short`, and then brings only
    SHORT_FILL (50-90%, uniform) of the ordered units.
    """

    lead_time_days: int
    p_late: float
    p_late2: float
    p_miss: float
    p_short: float

    def __post_init__(self) -> None:
        if self.lead_time_days < 1:
            raise ValueError("lead time must be at least one day")
        if not 0 <= self.p_late + self.p_late2 <= 1 or not 0 <= self.p_miss < 1 or not 0 <= self.p_short <= 1:
            raise ValueError("invalid delivery probabilities")

    @property
    def fill_rate(self) -> float:
        """Expected share of ordered units delivered (missed orders count as zero)."""
        return (1.0 - self.p_miss) * (1.0 - self.p_short * (1.0 - sum(SHORT_FILL) / 2))

    def delay_moments(self) -> tuple[float, float]:
        """Mean and standard deviation (days) of the delivery lead time, given that it arrives."""
        mean = self.lead_time_days + self.p_late + 2 * self.p_late2
        second = (self.lead_time_days ** 2 * (1 - self.p_late - self.p_late2)
                  + (self.lead_time_days + 1) ** 2 * self.p_late + (self.lead_time_days + 2) ** 2 * self.p_late2)
        return mean, math.sqrt(max(second - mean ** 2, 0.0))


@dataclass(frozen=True)
class Supplier:
    id: str
    name: str
    archetype: str
    mode: str
    via_hormuz: bool
    normal: SupplyTerms
    #: Terms for orders placed during the Hormuz 2026 disruption window (config: world.hormuz_2026).
    #: ASSUMPTION informed by Goharbakhsh et al. (2026: Hormuz transits fell 95.1% in Mar-May 2026)
    #: and Sohail (2026: fresh transit times rose by "several days"); None = unaffected.
    disrupted: SupplyTerms | None


#: Local and GCC lead times are short; importers deliver from their UAE warehouses, so the sea and air
#: disruption shows up as late, short or missed deliveries rather than as ocean transit time.
SUPPLY_TERMS: dict[str, tuple[SupplyTerms, SupplyTerms | None]] = {
    # SupplyTerms(lead days, p_late, p_late2, p_miss, p_short)
    "sup-local-farm": (SupplyTerms(1, 0.02, 0.00, 0.007, 0.04), None),
    "sup-local-bakery": (SupplyTerms(1, 0.01, 0.00, 0.007, 0.04), None),
    "sup-gcc-truck": (SupplyTerms(2, 0.04, 0.01, 0.007, 0.08), None),
    "sup-gcc-ksa": (SupplyTerms(3, 0.05, 0.01, 0.007, 0.08), None),
    "sup-sea-import": (SupplyTerms(2, 0.03, 0.01, 0.007, 0.08), SupplyTerms(5, 0.35, 0.15, 0.080, 0.60)),
    "sup-sea-khorfakkan": (SupplyTerms(3, 0.04, 0.01, 0.007, 0.08), SupplyTerms(4, 0.15, 0.05, 0.030, 0.25)),
    "sup-sea-europe": (SupplyTerms(3, 0.05, 0.01, 0.007, 0.08), SupplyTerms(7, 0.40, 0.20, 0.100, 0.70)),
    "sup-air-import": (SupplyTerms(2, 0.05, 0.01, 0.010, 0.10), SupplyTerms(4, 0.20, 0.05, 0.050, 0.35)),
    "sup-air-europe": (SupplyTerms(2, 0.05, 0.01, 0.010, 0.10), SupplyTerms(4, 0.20, 0.05, 0.050, 0.35)),
}


@lru_cache(maxsize=1)
def suppliers() -> tuple[Supplier, ...]:
    """Suppliers in route order, joined with their delivery terms."""
    out = []
    for route in SUPPLIER_ROUTES:
        normal, disrupted = SUPPLY_TERMS[route.supplier_id]
        out.append(Supplier(route.supplier_id, route.supplier_name, route.archetype, route.mode,
                            "hormuz" in route.chokepoint_ids, normal, disrupted))
    if {s.id for s in out} != set(SUPPLY_TERMS):
        raise ValueError("every supplier route needs delivery terms and vice versa")
    return tuple(out)


# --- Derived values ---------------------------------------------------------------------------------------

def lognormal_from_quantiles(p10: float, p50: float, p90: float) -> tuple[float, float]:
    """(mu, sigma) of the log-normal whose median is p50 and whose p10-p90 spread matches."""
    return math.log(p50), (math.log(p90) - math.log(p10)) / (2 * Z90)


def markups(calibration: dict, seed: int) -> dict[str, float]:
    """Retail/wholesale markup per SKU, drawn from the real Kaggle distribution (REAL, seeded draw).

    Vegetable SKUs use their Kaggle category's distribution; the rest use the overall one (ASSUMPTION:
    the same economics apply to the other fresh categories). Draws are clipped to the real p10-p90 range
    widened by 10%, so no SKU gets an implausible markup.
    """
    table = calibration["veg"]["markup_retail_over_wholesale"]
    rng = rng_for(seed, "markup")
    out = {}
    for sku in SKUS:
        q = table["by_category"][sku.reference] if sku.reference else table["overall"]
        mu, sigma = lognormal_from_quantiles(q["p10"], q["p50"], q["p90"])
        draw = math.exp(rng.normal(mu, sigma))
        out[sku.id] = float(np.clip(draw, q["p10"] / 1.1, q["p90"] * 1.1))
    return out


def unit_cost(sku: Sku, markup: float) -> float:
    """Unit cost (AED) = shelf price ÷ markup, rounded to fils (2 decimals)."""
    return round(sku.price_aed / markup, 2)


def shelf_life_days(sku: Sku) -> int:
    """Planning shelf life from receipt (data/external/shelf_life.csv)."""
    return planning_shelf_life_days(sku.shelf_category)


def loss_target_pct(sku: Sku, calibration: dict) -> float | None:
    """Real Kaggle loss rate (%) for a vegetable SKU, or None when the real data has no equivalent.

    Cucumbers have no Kaggle category, so they take the overall kg-weighted vegetable rate.
    """
    spoilage = calibration["veg"]["spoilage"]
    if sku.category_id not in ("leafy-greens", "salad-vegetables"):
        return None
    if sku.reference is None:
        return float(spoilage["kg_weighted_pct_overall"])
    return float(spoilage["kg_weighted_pct_by_category"][sku.reference])


def validate_world(world_config: dict) -> None:
    """Consistency checks between this catalogue, the routes and pipeline/config.yaml."""
    supplier_ids = {s.id for s in suppliers()}
    category_ids = {c.id for c in CATEGORIES}
    sku_ids = [s.id for s in SKUS]
    store_ids = [s.id for s in STORES]
    if len(set(sku_ids)) != len(sku_ids) or len(set(store_ids)) != len(store_ids):
        raise ValueError("duplicate store or SKU ids")
    if len(STORES) != world_config["stores"] or len(SKUS) != world_config["skus"]:
        raise ValueError("config world.stores / world.skus disagree with the catalogue")
    if len(HERO_STORES) != world_config["hero_stores"] or len(HERO_SKUS) != world_config["hero_skus_per_store"]:
        raise ValueError("config hero counts disagree with the catalogue")
    if not set(HERO_STORES) <= set(store_ids) or not set(HERO_SKUS) <= set(sku_ids):
        raise ValueError("hero series must use catalogue ids")
    for sku in SKUS:
        if sku.category_id not in category_ids:
            raise ValueError(f"{sku.id}: unknown category {sku.category_id}")
        if sku.supplier_id not in supplier_ids:
            raise ValueError(f"{sku.id}: unknown supplier {sku.supplier_id}")
        if sku.unit not in ("kg", "each", "pack") or sku.case_pack < 1 or sku.base_daily <= 0:
            raise ValueError(f"{sku.id}: invalid unit, case pack or base demand")


def catalog_body(calibration: dict, seed: int) -> dict[str, object]:
    """The catalog.json body (contract: web/src/lib/contracts/reference.ts, CatalogFile)."""
    mk = markups(calibration, seed)
    life = {sku.id: shelf_life_days(sku) for sku in SKUS}
    categories = []
    for cat in CATEGORIES:
        days = [life[s.id] for s in SKUS if s.category_id == cat.id]
        categories.append({"id": cat.id, "name": cat.name, "shelfLifeDays": {"min": min(days), "max": max(days)}})
    return {
        "stores": [{"id": s.id, "name": s.name, "area": s.area, "emirate": s.emirate, "lat": s.lat, "lon": s.lon,
                    "sizeIndex": s.size_index} for s in STORES],
        "categories": categories,
        "skus": [{"id": s.id, "name": s.name, "categoryId": s.category_id, "unit": s.unit, "kgPerUnit": s.kg_per_unit,
                  "shelfLifeDays": life[s.id], "unitCostAED": unit_cost(s, mk[s.id]), "priceAED": s.price_aed,
                  "casePack": s.case_pack, "primarySupplierId": s.supplier_id} for s in SKUS],
        "heroSeries": [{"storeId": store, "skuId": sku} for store in HERO_STORES for sku in HERO_SKUS],
    }

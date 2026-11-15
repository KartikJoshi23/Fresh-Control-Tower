"""Ordering decisions: the AI policies, costs, τ simulation-optimisation and the surge planner (P4-01, P4-02).

**AI order-up-to rule (plan §4.1).** At the 22:00 review an order must cover the days until the next
delivery after it lands: C = ⌈mean lead time⌉ + R − 1 days (as for P0, decision D-21). The order-up-to
level is the τ-quantile of forecast demand over those days,

    S = (Σ μ_j + z(τ) · σ_C) ÷ (1 − handling loss),   σ_C = √(ρ (Σ σ_j)² + (1 − ρ) Σ σ_j²),

with μ_j the P50 forecast and σ_j = (P90 − P10) ÷ (2 × 1.2816) for day t + j, and ρ = 0.3 for the
correlation of daily forecast errors (ASSUMPTION; τ absorbs any misfit). Order = S − on hand − on order,
rounded to whole cases.

**Shelf-life guard.** Never order more than can be sold before it expires at P50 demand: the order is
capped at the P50 demand from its arrival day to the end of its shelf life, net of the stock already there.
**Minimum presentation stock** (one case) applies, as for P0, so the comparison is fair.

**The policy ladder (plan §4.5):**
- **P1 AI-Daily:** the rule above, with recovered-demand quantile forecasts and a per-SKU τ. It plans with
  the lead time of the supplier terms in force (an AI system tracks supplier performance).
- **P2 AI-Intraday:** P1 plus real-time stock visibility. A noon check projects the rest of the day's demand
  from the morning's sales and tops up from a UAE wholesale market (same day, 16:00, at a premium). When a
  store's sales run well above forecast (the store-level spike signal of P3-05), the next two days' forecasts
  are scaled up.
- **P3 AI-Intraday + Smart Sourcing:** P2 plus, during a supply disruption, ordering each affected SKU from
  its best compatible supplier by TOPSIS under the disruption scenario (P4-03).

**τ per SKU** is chosen by grid search in the full FIFO simulation, minimising expected total cost on the
2025 H2 validation window with out-of-sample forecasts. The newsvendor critical ratio Cu ÷ (Cu + Co) gives
the intuition (about 0.40 at the real median markup) and is checked in a worked test.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.stats import norm

from .simulate import OrderBatch, SeriesParams, State, SupplyModel, round_to_case
from .world import SKUS

Z90 = 1.2815515655446004
ERROR_CORRELATION = 0.3
TAU_GRID = (0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99)
TOPUP_HOUR = 11                 # decide at the end of 11:00-11:59 ("noon"); delivered 16:00 (simulate.TOPUP_ARRIVAL_HOUR)
TOPUP_PRIOR_MASS = 0.3          # weight of the P50 forecast against the morning's sales (profile-mass units)
SPIKE_RATIO = 1.3               # store sales ÷ forecast above which P2 treats the day as a surge
SPIKE_CAP = 2.5
SPIKE_PERSIST_DAYS = 2

# Cost assumptions (AED), documented in docs/06-decisions.md.
GOODWILL_SHARE_OF_PRICE = 0.10   # a lost sale also costs future custom: 10% of the shelf price
DISPOSAL_AED_PER_KG = 0.20       # disposal of spoiled food
HOLDING_SHARE_PER_DAY = 0.003    # refrigeration and capital: 0.3% of unit cost per unit per day
TOPUP_PREMIUM = 0.25             # wholesale-market top-ups cost 25% more than the usual unit cost

#: Suppliers each category can buy from (ASSUMPTION; P3 switches only within this list).
COMPATIBLE = {
    "leafy-greens": ("sup-local-farm", "sup-gcc-truck", "sup-air-import"),
    "berries": ("sup-air-europe", "sup-air-import"),
    "stone-fruit": ("sup-sea-europe", "sup-sea-import", "sup-sea-khorfakkan", "sup-air-europe"),
    "salad-vegetables": ("sup-local-farm", "sup-gcc-truck", "sup-gcc-ksa"),
    "dairy": ("sup-gcc-ksa", "sup-gcc-truck"),
    "bakery": ("sup-local-bakery",),
    "poultry": ("sup-gcc-ksa", "sup-gcc-truck"),
    "dates": ("sup-gcc-ksa", "sup-gcc-truck"),
    "fruit": ("sup-sea-import", "sup-sea-khorfakkan", "sup-sea-europe", "sup-air-import"),
}


# --- Costs ---------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class CostModel:
    """Per-series unit economics (arrays of length n)."""

    price: np.ndarray
    unit_cost: np.ndarray
    kg_per_unit: np.ndarray

    @property
    def underage(self) -> np.ndarray:
        """Cu: lost margin plus goodwill per unit short."""
        return self.price - self.unit_cost + GOODWILL_SHARE_OF_PRICE * self.price

    @property
    def overage(self) -> np.ndarray:
        """Co: unit cost plus disposal per unit wasted (no salvage)."""
        return self.unit_cost + DISPOSAL_AED_PER_KG * self.kg_per_unit

    @property
    def holding_per_day(self) -> np.ndarray:
        return HOLDING_SHARE_PER_DAY * self.unit_cost

    @classmethod
    def from_catalog(cls, catalog: dict, series_sku: np.ndarray) -> "CostModel":
        skus = {s["id"]: s for s in catalog["skus"]}
        rows = [skus[SKUS[k].id] for k in series_sku]
        return cls(np.array([r["priceAED"] for r in rows]), np.array([r["unitCostAED"] for r in rows]),
                   np.array([r["kgPerUnit"] for r in rows]))


def critical_ratio(cost: CostModel) -> np.ndarray:
    """Newsvendor critical ratio Cu ÷ (Cu + Co)."""
    return cost.underage / (cost.underage + cost.overage)


def newsvendor_quantity(mu: float, sigma: float, cu: float, co: float) -> float:
    """Single-period optimum for normal demand: μ + σ Φ⁻¹(Cu ÷ (Cu + Co))."""
    return mu + sigma * float(norm.ppf(cu / (cu + co)))


# --- The AI policies --------------------------------------------------------------------------------------------

def sigma_from_band(p10: np.ndarray, p90: np.ndarray) -> np.ndarray:
    return np.maximum(p90 - p10, 0.0) / (2 * Z90)


@dataclass
class AIPolicy:
    """P1/P2/P3. `fc` holds forecast quantiles aligned to SIMULATION days: (buckets, 3, n, days)."""

    name: str
    fc: np.ndarray
    tau: np.ndarray
    supply: SupplyModel
    profile: np.ndarray                       # (n, days, 24) intraday profile per series-day
    store_of: np.ndarray                      # (n,) store index (for the store-level surge signal)
    intraday: bool = False
    alt_supplier: np.ndarray | None = None    # (n,) supplier used during a disruption (P3); None = primary
    min_cases: int = 1
    review_period: int = 1
    _uplift: np.ndarray | None = field(default=None, repr=False)

    @property
    def topup_hour(self) -> int | None:
        return TOPUP_HOUR if self.intraday else None

    def _quantiles(self, day: int, j: int) -> tuple[np.ndarray, np.ndarray]:
        bucket = 0 if j <= 7 else (1 if j <= 14 else 2)
        t = min(day + j, self.fc.shape[3] - 1)
        q = self.fc[bucket, :, :, t]
        mu = np.nan_to_num(q[1], nan=0.0)
        if self._uplift is not None and j <= SPIKE_PERSIST_DAYS:
            mu = mu * self._uplift
        return mu, sigma_from_band(np.nan_to_num(q[0]), np.nan_to_num(q[2]))

    def supplier_for(self, day: int, params: SeriesParams) -> np.ndarray:
        if self.alt_supplier is None or not (self.supply.window[0] <= day <= self.supply.window[1]):
            return params.supplier
        return self.alt_supplier

    def level(self, state: State, supplier: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """(order-up-to level S, shelf-life cap on the order) per series."""
        lead, p_late, p_late2, _, _ = self.supply.terms(state.day, supplier)
        coverage = np.ceil(lead + p_late + 2 * p_late2 - 1e-9).astype(int) + self.review_period - 1
        prm = state.params
        horizon = int(max(coverage.max(), (coverage + prm.shelf_life).max()))
        mus, sigmas = zip(*(self._quantiles(state.day, j) for j in range(1, horizon + 1)))
        mu, sig = np.array(mus), np.array(sigmas)                        # (horizon, n)
        j = np.arange(1, horizon + 1)[:, None]
        cover = j <= coverage[None, :]
        mu_sum = (mu * cover).sum(axis=0)
        s_sum, s_sq = (sig * cover).sum(axis=0), ((sig * cover) ** 2).sum(axis=0)
        sigma_c = np.sqrt(ERROR_CORRELATION * s_sum ** 2 + (1 - ERROR_CORRELATION) * s_sq)
        z = norm.ppf(np.clip(self.tau, 0.01, 0.999))
        keep = 1.0 - prm.handling_loss
        level = (mu_sum + z * sigma_c) / keep
        sellable = (j >= coverage[None, :]) & (j < coverage[None, :] + prm.shelf_life[None, :])
        cap = np.maximum((mu * sellable).sum(axis=0) - state.on_hand - state.on_order, 0.0) / keep
        return np.maximum(level, self.min_cases * prm.case_pack), cap

    def orders(self, state: State) -> list[OrderBatch]:
        if self.intraday and state.sales_today is not None:
            self._set_surge(state)
        supplier = self.supplier_for(state.day, state.params)
        level, cap = self.level(state, supplier)
        position = state.on_hand + state.on_order
        floor = self.min_cases * state.params.case_pack - position
        raw = np.maximum(np.minimum(level - position, cap), floor)
        self._uplift = None
        return [OrderBatch(round_to_case(raw, state.params.case_pack), supplier)]

    def _set_surge(self, state: State) -> None:
        """Store-level surge signal: today's sales well above forecast lift the next days' forecasts."""
        p50 = np.nan_to_num(self.fc[0, 1, :, state.day], nan=0.0)
        n_stores = int(self.store_of.max()) + 1
        sold = np.bincount(self.store_of, weights=state.sales_today, minlength=n_stores)
        expected = np.bincount(self.store_of, weights=p50, minlength=n_stores)
        ratio = np.where(expected > 0, sold / np.maximum(expected, 1e-9), 1.0)
        surge = np.where(ratio >= SPIKE_RATIO, np.minimum(ratio, SPIKE_CAP), 1.0)
        self._uplift = surge[self.store_of]

    def topup(self, state: State) -> np.ndarray:
        """Noon top-up: rest-of-day demand projected from the morning (profile recovery logic, P3-01)."""
        d = state.day
        mass = self.profile[:, d, :state.hour + 1].sum(axis=1)
        p50 = np.nan_to_num(self.fc[0, 1, :, d], nan=0.0)
        level = (state.sales_today + TOPUP_PRIOR_MASS * p50) / (mass + TOPUP_PRIOR_MASS)
        rest = level * np.maximum(1.0 - mass, 0.0)
        need = rest + norm.ppf(np.clip(self.tau, 0.01, 0.999)) * np.sqrt(rest + (0.15 * rest) ** 2)
        gap = (need - state.on_hand) / (1.0 - state.params.handling_loss)
        return round_to_case(np.where(gap > 0, gap, 0.0), state.params.case_pack)


def smart_sourcing_suppliers(series_sku: np.ndarray, supplier_ids: list[str], scores: dict[str, float],
                             disrupted: set[str]) -> np.ndarray:
    """P3: for each series, the best compatible supplier by TOPSIS under the disruption (primary if unaffected)."""
    out = []
    for k in series_sku:
        sku = SKUS[k]
        if sku.supplier_id not in disrupted:
            out.append(supplier_ids.index(sku.supplier_id))
            continue
        options = COMPATIBLE[sku.category_id]
        best = max(options, key=lambda s: scores[s])
        out.append(supplier_ids.index(best))
    return np.array(out)


# --- KPIs and cost of a run -------------------------------------------------------------------------------------------

def run_costs(run, truth: np.ndarray, cost: CostModel, supplier_cost_factor: np.ndarray,
              primary_supplier: np.ndarray, transport_kgco2_per_kg: np.ndarray, food_kgco2_per_kg: np.ndarray,
              days: np.ndarray, series: np.ndarray | None = None, topup_kgco2_per_kg: float = 0.0) -> dict[str, float]:
    """KPIs of one run over a day mask (simulation days) and optional series mask (plan §4.5, contract Kpis)."""
    led = run.daily
    s = slice(None) if series is None else series
    dd = days
    sales = led["sales"][s][:, dd].astype(float)
    dem = truth[s][:, dd].astype(float)
    lost = np.maximum(dem - sales, 0.0)
    waste = (led["handling_loss"] + led["expired"])[s][:, dd].astype(float)
    receipts = led["receipts"][s][:, dd].astype(float)
    expedited = led["expedited"][s][:, dd].astype(float)
    closing = led["closing"][s][:, dd].astype(float)
    kg = cost.kg_per_unit[s][:, None]
    price, ucost = cost.price[s][:, None], cost.unit_cost[s][:, None]
    oos = run.oos_h[s][:, dd][:, :, 6:22]

    # Deliveries by supplier: sourcing premium and transport CO2e (from the order log).
    o = run.orders
    delivered = o.loc[(o["delivered"] > 0) & (o["arrival_day"] >= 0)]
    in_window = np.isin(delivered["arrival_day"].to_numpy(), np.flatnonzero(dd))
    if series is not None:
        in_window &= np.isin(delivered["series"].to_numpy(), np.flatnonzero(np.asarray(series)))
    d = delivered.loc[in_window]
    ser, sup, units = d["series"].to_numpy(), d["supplier"].to_numpy(), d["delivered"].to_numpy(float)
    factor = supplier_cost_factor[sup] / supplier_cost_factor[primary_supplier[ser]]
    sourcing_premium = float(((factor - 1.0) * cost.unit_cost[ser] * units).clip(min=0).sum())
    transport = float((units * cost.kg_per_unit[ser] * transport_kgco2_per_kg[sup]).sum())
    transport += float((expedited * kg).sum() * topup_kgco2_per_kg)

    lost_margin = float((lost * (price - ucost + GOODWILL_SHARE_OF_PRICE * price)).sum())
    waste_cost = float((waste * (ucost + DISPOSAL_AED_PER_KG * kg)).sum())
    holding = float((closing * HOLDING_SHARE_PER_DAY * ucost).sum())
    expedite = float((expedited * ucost * TOPUP_PREMIUM).sum()) + sourcing_premium
    food = float((waste * kg * food_kgco2_per_kg[s][:, None]).sum())
    return {
        "availabilityPct": 100.0 * (1.0 - float(oos.mean())),
        "fillRatePct": 100.0 * float(sales.sum() / dem.sum()),
        "lostSalesUnits": float(lost.sum()),
        "lostSalesAED": float((lost * price).sum()),
        "wasteKg": float((waste * kg).sum()),
        "wastePctOfReceipts": 100.0 * float((waste * kg).sum() / max((receipts * kg).sum(), 1e-9)),
        "holdingAED": holding,
        "expediteAED": expedite,
        "totalCostAED": lost_margin + waste_cost + holding + expedite,
        "co2eKg": food + transport,
        "daysOfCover": float(closing.sum() / max(dem.sum(), 1e-9)),
        "_components": {"lost_margin_goodwill": lost_margin, "waste": waste_cost, "holding": holding,
                        "expedite": expedite, "co2e_food": food, "co2e_transport": transport,
                        "expired_kg": float((led["expired"][s][:, dd] * kg).sum())},
    }


def per_series_cost(run, truth: np.ndarray, cost: CostModel, days: np.ndarray) -> np.ndarray:
    """(n,) total cost per series (lost margin + goodwill + waste + holding + top-up premium) over `days`."""
    led = run.daily
    lost = np.maximum(truth[:, days] - led["sales"][:, days], 0).sum(axis=1)
    waste = (led["handling_loss"] + led["expired"])[:, days].sum(axis=1)
    closing = led["closing"][:, days].sum(axis=1)
    expedited = led["expedited"][:, days].sum(axis=1)
    return (lost * cost.underage + waste * cost.overage + closing * cost.holding_per_day
            + expedited * cost.unit_cost * TOPUP_PREMIUM)


# --- Surge planner (plan §4.2, requirement R4) ---------------------------------------------------------------------

@dataclass(frozen=True)
class SupplierOption:
    id: str
    lead_days: int
    cost_factor: float              # landed cost relative to the primary supplier
    co2e_per_kg: float


def plan_surge(today: int, spike_start: int, spike_days: int, extra_per_day: float, shelf_life: int,
               min_remaining: int, options: list[SupplierOption], unit_cost: float, price: float, kg_per_unit: float,
               handling_buffer_days: int = 1) -> dict[str, object]:
    """Options to cover a KNOWN spike announced at `today` (days are integers; demand in units).

    - latest safe order day for supplier s = spike start − lead − handling buffer;
    - the stock must arrive by spike start − buffer, and it stays sellable for (shelf life − minimum remaining
      shelf life at sale) days, so one delivery covers the spike days up to arrival + that window − 1;
    - if a single pre-built delivery cannot cover the whole spike, the rest needs a second, later delivery
      (split) or is lost (planned shortfall).
    Returns each option's lost units, waste units, extra cost (AED) and transport CO2e, plus the minimum
    warning time that makes full coverage possible.
    """
    spike_end = spike_start + spike_days - 1
    sellable = max(shelf_life - min_remaining, 1)
    arrival = spike_start - handling_buffer_days
    covered_days = max(0, min(spike_end, arrival + sellable - 1) - spike_start + 1)
    total_extra = extra_per_day * spike_days
    rows = []
    feasible = []
    for s in options:
        latest = spike_start - s.lead_days - handling_buffer_days
        ok = today <= latest
        feasible.append((s, latest, ok))
    best = [x for x in feasible if x[2]]

    def option(name: str, supplier: SupplierOption | None, units_covered: float, ordered: float, note: str) -> dict:
        lost = total_extra - units_covered
        waste = max(ordered - units_covered, 0.0)
        extra_cost = 0.0 if supplier is None else ordered * unit_cost * supplier.cost_factor
        margin = units_covered * (price - unit_cost * (supplier.cost_factor if supplier else 1.0))
        co2 = 0.0 if supplier is None else ordered * kg_per_unit * supplier.co2e_per_kg
        return {"option": name, "supplierId": supplier.id if supplier else None, "orderedUnits": round(ordered, 2),
                "lostUnits": round(lost, 2), "wasteUnits": round(waste, 2), "purchaseAED": round(extra_cost, 2),
                "marginAED": round(margin, 2), "lostMarginAED": round(lost * (price - unit_cost), 2),
                "co2eKg": round(co2, 3), "note": note}

    primary = options[0]
    p_ok = feasible[0][2]
    one_delivery = extra_per_day * covered_days
    rows.append(option("prebuild_primary", primary if p_ok else None, one_delivery if p_ok else 0.0,
                       one_delivery if p_ok else 0.0,
                       "Order window still open." if p_ok else "Order window closed: primary lead time too long."))
    if best:
        fastest = min(best, key=lambda x: x[0].lead_days)[0]
        rows.append(option("switch_faster", fastest, one_delivery, one_delivery,
                           f"Fastest supplier with an open window ({fastest.id})."))
        # Split: a second delivery arriving when the first batch's sellable window ends.
        second_arrival = arrival + sellable
        second = [s for s, _, _ in feasible if today + s.lead_days + handling_buffer_days <= second_arrival]
        if covered_days < spike_days and second:
            s2 = min(second, key=lambda s: s.cost_factor)
            rows.append(option("split", s2, total_extra, total_extra,
                               f"Two deliveries: day {arrival} and day {second_arrival} ({s2.id})."))
    rows.append(option("accept_shortfall", None, 0.0, 0.0, "No extra stock: the spike's extra demand is lost."))
    min_warning = min(s.lead_days for s in options) + handling_buffer_days
    return {"latestSafeOrderDay": {s.id: latest for s, latest, _ in feasible},
            "earliestUsefulArrivalDay": spike_end - sellable + 1, "singleDeliveryCoversDays": covered_days,
            "minimumWarningDays": min_warning, "options": rows}

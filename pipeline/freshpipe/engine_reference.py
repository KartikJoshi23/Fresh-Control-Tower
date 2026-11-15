"""Python reference of the in-browser scenario engine (P4-06), and its golden cases for the parity tests (P7-02).

The browser (Part 7, `web/src/lib/engine/`) must reproduce `run_engine` to within 1e-6 on every golden case
in `web/tests/fixtures/golden/engine_cases.json`. Everything below is specified so it can be ported line for line.

**Inputs:** a series file's `engine` block (contract `EngineParams`) plus a scenario:
`demandMultiplier`, an optional spike `{startDay, days, magnitude, warningDays}`, `policy` ("P0" or "AI"),
`tau` (null = `optimalTau`), `supplierIndex` (into `leadTimes`), `leadTimeMultiplier`, an optional
manual order `{day, qty}`, and three what-if levers with neutral defaults: `dayFactors` (one demand factor per
horizon day, e.g. the Ramadan effect; missing or null = 1), `forecastFactor` (multiplies only the AI's planning
forecast, e.g. 0.73 when it learns from till sales only; default 1) and `lateProbability` (the share of orders
that arrive one day late, unknown to the planner in advance; default 0).

**One day d = 0 … H−1** (H = len(horizonQuantiles), at most 35):
1. *Receive* every batch due on day d (arrival = order day + lead time: an order placed at the end of day t
   lands at dawn of day t + L, as in the hourly engine). Each batch keeps its own expiry.
2. *Demand.* μ_d = P50_d × demandMultiplier × dayFactor_d × spike_d (multiplied in this order). Deterministic mode: demand = round_half_up(μ_d).
   Monte Carlo mode: σ_d = (ln P90_d − ln P10_d) ÷ (2 × 1.2815515655446004) (0 if P10 ≤ 0) and
   demand = round_half_up(μ_d × exp(σ_d z − σ_d² / 2)), z from Box–Muller on two mulberry32 draws
   (u1 = 1 − next(), u2 = next(); z = √(−2 ln u1) cos(2π u2)).
3. *Sell* first-expiring first (FIFO). Lost = demand − sold.
4. *Expire* at the end of the day every batch whose expiry day ≤ d (waste).
5. *Order* at the end of every review day (d mod reviewPeriodDays = 0). Lead time L = max(1, round_half_up(
   meanDays × leadTimeMultiplier)); in Monte Carlo mode L = max(1, round_half_up(meanDays × multiplier + sdDays × z′)).
   - AI: S = Σ_{j=1..L} μ̂_{d+j} + Φ⁻¹(τ) × √(Σ σ̂²_{d+j} × μ̂²_{d+j}) with μ̂ the planning forecast: P50 ×
     demandMultiplier × dayFactor, × the spike only once it is announced (d ≥ startDay − warningDays), ×
     forecastFactor (in this order). Days past the horizon reuse its last day. Φ⁻¹ is Acklam's rational
     approximation (`norm_ppf`).
   - P0: S = 1.2 × L × the mean of the last min(d + 1, 28) days' SALES (day 0: P50_0 × 0.8, the censored view).
   - Order = round_to_case(S − on hand − on order, casePack); the manual order replaces it on its day.
   - Late deliveries (only when lateProbability p > 0 and the order is positive): the order lands on d + L + 1
     instead of d + L. Deterministic mode: exactly that share of orders, i.e. the n-th order placed (n = 0, 1, …)
     is late when floor((n + 1) p) > floor(n p). Monte Carlo mode: late when one more draw next() < p (drawn after
     the lead-time draw). With p = 0 nothing is drawn, so every other result is unchanged.
   - Shelf-life guard (AI only): the order never exceeds Σ μ̂ over its sellable days (d + L … d + L +
     shelfLifeDays − minRemainingShelfLifeDays − 1) minus the stock already held and on order.
6. *Cost:* holding += on hand at close × holdingCostPerUnitDayAED.

**KPIs:** sold, lost, waste and receipts (units); fillRate = sold ÷ demand; daysWithStockout (lost > 0);
lostMarginAED = lost × (price − unit cost); goodwillAED = lost × goodwillPerUnitAED;
wasteAED = waste × (unit cost + wasteDisposalPerUnitAED); holdingAED; purchaseAED = received × unit cost;
totalCostAED = lostMargin + goodwill + waste + holding. Monte Carlo: P10/P50/P90 over `runs` (50).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

Z90 = 1.2815515655446004
P0_BUFFER = 0.20
P0_WINDOW = 28
P0_CENSORED_VIEW = 0.8


# --- Shared primitives (port these exactly) -----------------------------------------------------------------

def mulberry32(seed: int):
    """The mulberry32 PRNG, bit-identical to the usual JavaScript version. Returns a function -> [0, 1)."""
    state = seed & 0xFFFFFFFF

    def imul(a: int, b: int) -> int:
        return (a * b) & 0xFFFFFFFF

    def nxt() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return nxt


def normal(rng) -> float:
    """Box–Muller standard normal from two draws."""
    u1 = 1.0 - rng()
    u2 = rng()
    return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)


def norm_ppf(p: float) -> float:
    """Acklam's approximation of the standard normal quantile (relative error < 1.2e-9)."""
    a = (-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02,
         -3.066479806614716e+01, 2.506628277459239e+00)
    b = (-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01,
         -1.328068155288572e+01)
    c = (-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00,
         4.374664141464968e+00, 2.938163982698783e+00)
    d = (7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00)
    p = min(max(p, 1e-12), 1 - 1e-12)
    lo, hi = 0.02425, 1 - 0.02425
    if p < lo:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > hi:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
                ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / \
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def round_half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def round_to_case(raw: float, case_pack: int) -> int:
    return int(math.floor(max(raw, 0.0) / case_pack + 0.5)) * case_pack


# --- The engine ------------------------------------------------------------------------------------------------

@dataclass
class Batch:
    qty: int
    expires: int        # last day it can be sold


def _scenario_defaults(s: dict) -> dict:
    return {"demandMultiplier": 1.0, "spike": None, "policy": "AI", "tau": None, "supplierIndex": 0,
            "leadTimeMultiplier": 1.0, "manualOrder": None, "dayFactors": None, "forecastFactor": 1.0,
            "lateProbability": 0.0} | s


def run_engine(engine: dict, scenario: dict, seed: int | None = None) -> dict:
    """One run. `seed` None = deterministic; otherwise a Monte Carlo draw from mulberry32(seed)."""
    sc = _scenario_defaults(scenario)
    q = engine["horizonQuantiles"]
    horizon = len(q)
    rng = mulberry32(seed) if seed is not None else None
    spike = sc["spike"]

    def spike_factor(day: int, planning_day: int | None = None) -> float:
        if not spike or not (spike["startDay"] <= day < spike["startDay"] + spike["days"]):
            return 1.0
        if planning_day is not None and planning_day < spike["startDay"] - spike.get("warningDays", 0):
            return 1.0
        return float(spike["magnitude"])

    def quantile(day: int) -> dict:
        return q[min(day, horizon - 1)]

    def day_factor(day: int) -> float:
        factors, i = sc["dayFactors"], min(day, horizon - 1)
        return float(factors[i]) if factors is not None and i < len(factors) and factors[i] is not None else 1.0

    orders_placed = 0

    def sigma(day: int) -> float:
        p10, p90 = quantile(day)["p10"], quantile(day)["p90"]
        return (math.log(p90) - math.log(p10)) / (2 * Z90) if p10 > 0 and p90 > p10 else 0.0

    supplier = engine["leadTimes"][sc["supplierIndex"]]
    tau = engine["optimalTau"] if sc["tau"] is None else sc["tau"]
    z_tau = norm_ppf(tau)
    shelf, min_rem = engine["shelfLifeDays"], engine["minRemainingShelfLifeDays"]
    sellable = max(shelf - min_rem, 1)
    case = engine["casePack"]
    batches: list[Batch] = [Batch(int(round_half_up(engine["initialOnHand"])), shelf - 1)] if engine["initialOnHand"] > 0 else []
    start = engine["planningStart"]
    pipeline: dict[int, int] = {}
    for o in engine["onOrder"]:
        day = _day_index(start, o["arrivalDate"])
        if day >= 0:
            pipeline[day] = pipeline.get(day, 0) + int(round_half_up(o["qty"]))
    sales_hist: list[int] = []
    rows = []
    totals = {"demand": 0, "sold": 0, "lost": 0, "waste": 0, "received": 0, "holdingAED": 0.0, "daysWithStockout": 0}
    for d in range(horizon):
        got = pipeline.pop(d, 0)
        if got:
            batches.append(Batch(got, d + shelf - 1))
        mu = quantile(d)["p50"] * sc["demandMultiplier"] * day_factor(d) * spike_factor(d)
        if rng is None:
            demand = round_half_up(mu)
        else:
            s = sigma(d)
            demand = max(0, round_half_up(mu * math.exp(s * normal(rng) - s * s / 2)))
        left = demand
        batches.sort(key=lambda b: b.expires)
        for b in batches:
            take = min(b.qty, left)
            b.qty -= take
            left -= take
        sold = demand - left
        waste = sum(b.qty for b in batches if b.expires <= d)
        batches = [b for b in batches if b.expires > d and b.qty > 0]
        on_hand = sum(b.qty for b in batches)
        sales_hist.append(sold)
        order = 0
        if d % engine["reviewPeriodDays"] == 0:
            lead_mean = supplier["meanDays"] * sc["leadTimeMultiplier"]
            if rng is None:
                lead = max(1, round_half_up(lead_mean))
            else:
                lead = max(1, round_half_up(lead_mean + supplier["sdDays"] * normal(rng)))
            on_order = sum(v for k, v in pipeline.items() if k > d)
            if sc["policy"] == "P0":
                recent = sales_hist[-P0_WINDOW:]
                avg = sum(recent) / len(recent) if d > 0 else quantile(0)["p50"] * P0_CENSORED_VIEW
                level = (1 + P0_BUFFER) * lead * avg
                order = round_to_case(level - on_hand - on_order, case)
            else:
                # plan[j - 1] is the planning forecast for day d + j; the order covers d + 1 … d + L and can be
                # sold from its arrival day d + L for `sellable` days.
                plan = [quantile(d + j)["p50"] * sc["demandMultiplier"] * day_factor(d + j) * spike_factor(d + j, d)
                        * sc["forecastFactor"] for j in range(1, lead + sellable)]
                mu_sum = sum(plan[:lead])
                var = sum((sigma(d + j) * plan[j - 1]) ** 2 for j in range(1, lead + 1))
                level = mu_sum + z_tau * math.sqrt(var)
                cap = max(sum(plan[lead - 1:lead - 1 + sellable]) - on_hand - on_order, 0.0)
                order = round_to_case(min(level - on_hand - on_order, cap), case)
            manual = sc["manualOrder"]
            if manual is not None and manual["day"] == d:
                order = int(manual["qty"])
            if order > 0:
                p, late = sc["lateProbability"], 0
                if p > 0:
                    late = int(math.floor((orders_placed + 1) * p) > math.floor(orders_placed * p)) if rng is None                         else int(rng() < p)
                orders_placed += 1
                pipeline[d + lead + late] = pipeline.get(d + lead + late, 0) + order
        holding = on_hand * engine["holdingCostPerUnitDayAED"]
        rows.append({"day": d, "receipts": got, "demand": demand, "sales": sold, "lost": demand - sold, "waste": waste,
                     "onHandClose": on_hand, "order": order})
        totals["demand"] += demand
        totals["sold"] += sold
        totals["lost"] += demand - sold
        totals["waste"] += waste
        totals["received"] += got
        totals["holdingAED"] += holding
        totals["daysWithStockout"] += int(demand > sold)
    return {"rows": rows, "kpis": kpis(engine, totals)}


def kpis(engine: dict, t: dict) -> dict[str, float]:
    price, cost = engine["priceAED"], engine["unitCostAED"]
    lost_margin = t["lost"] * (price - cost)
    goodwill = t["lost"] * engine["goodwillPerUnitAED"]
    waste_aed = t["waste"] * (cost + engine["wasteDisposalPerUnitAED"])
    return {"demand": t["demand"], "sold": t["sold"], "lost": t["lost"], "waste": t["waste"], "received": t["received"],
            "fillRate": round(t["sold"] / t["demand"], 9) if t["demand"] else 1.0,
            "daysWithStockout": t["daysWithStockout"], "lostMarginAED": round(lost_margin, 6),
            "goodwillAED": round(goodwill, 6), "wasteAED": round(waste_aed, 6), "holdingAED": round(t["holdingAED"], 6),
            "purchaseAED": round(t["received"] * cost, 6),
            "totalCostAED": round(lost_margin + goodwill + waste_aed + t["holdingAED"], 6)}


def monte_carlo(engine: dict, scenario: dict, runs: int = 50, seed: int = 2026) -> dict[str, dict[str, float]]:
    """P10/P50/P90 of each KPI over `runs` runs with seeds seed, seed + 1, …"""
    results = [run_engine(engine, scenario, seed + r)["kpis"] for r in range(runs)]
    out = {}
    for key in results[0]:
        values = sorted(r[key] for r in results)
        out[key] = {"p10": _quantile(values, 0.1), "p50": _quantile(values, 0.5), "p90": _quantile(values, 0.9)}
    return out


def _quantile(sorted_values: list[float], p: float) -> float:
    """Linear interpolation between order statistics (numpy's default), as the browser must do."""
    pos = (len(sorted_values) - 1) * p
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(sorted_values) - 1)
    return round(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo), 6)


def _day_index(start: str, date: str) -> int:
    from datetime import date as _date

    return (_date.fromisoformat(date) - _date.fromisoformat(start)).days


# --- Golden cases ---------------------------------------------------------------------------------------------------

GOLDEN_SCENARIOS = (
    ("base-ai", {"policy": "AI"}),
    ("base-p0", {"policy": "P0"}),
    ("demand-x1.5", {"policy": "AI", "demandMultiplier": 1.5}),
    ("spike-unannounced", {"policy": "AI", "spike": {"startDay": 10, "days": 3, "magnitude": 2.5, "warningDays": 0}}),
    ("spike-announced-7d", {"policy": "AI", "spike": {"startDay": 10, "days": 3, "magnitude": 2.5, "warningDays": 7}}),
    ("slow-supplier-x2", {"policy": "AI", "leadTimeMultiplier": 2.0}),
    ("tau-0.95", {"policy": "AI", "tau": 0.95}),
    ("manual-order", {"policy": "AI", "manualOrder": {"day": 5, "qty": 120}}),
    ("day-factors", {"policy": "AI", "dayFactors": [1.1] * 7 + [1.35] * 21 + [0.9] * 7}),
    ("forecast-x0.73", {"policy": "AI", "forecastFactor": 0.7334}),
    ("late-30pct-ai", {"policy": "AI", "lateProbability": 0.3}),
    ("late-30pct-p0", {"policy": "P0", "lateProbability": 0.3}),
)


def golden_cases(series_files: list[dict], runs: int = 50, seed: int = 2026) -> dict[str, object]:
    """Deterministic and Monte Carlo outputs for every scenario on the given series files' engine blocks."""
    rng = mulberry32(42)
    cases = []
    for sf in series_files:
        for name, scenario in GOLDEN_SCENARIOS:
            cases.append({"id": f"{sf['storeId']}__{sf['skuId']}__{name}", "storeId": sf["storeId"], "skuId": sf["skuId"],
                          "engine": sf["engine"], "scenario": scenario,
                          "deterministic": run_engine(sf["engine"], scenario),
                          "monteCarlo": {"runs": runs, "seed": seed, "kpis": monte_carlo(sf["engine"], scenario, runs, seed)}})
    return {"schemaVersion": "1.0", "tolerance": 1e-6,
            "prng": {"name": "mulberry32", "seed": 42, "first5": [round(rng(), 12) for _ in range(5)]},
            "normPpf": {str(p): round(norm_ppf(p), 12) for p in (0.5, 0.75, 0.9, 0.95, 0.99, 0.01)},
            "cases": cases}

"""Monte Carlo backtests of the policy ladder P0-P3 and the waste-availability frontier (P4-04, plan §4.5).

Each run re-plays the 2026 test window (with a 28-day warm-up) on the same 320 series:
- **demand noise** is redrawn around the world's expected demand (the same gamma-Poisson noise and hourly
  split as the generator); run 0 keeps the generated demand;
- **supply** (late, short and missed deliveries) and **quality culls** get independent draws (`run` index).
All four policies see the same demand in a run, so their differences are paired. KPIs are summarised as
P10/P50/P90 over runs, per stress window.

Forecasts come from Part 3, fitted on Jan 2023-Dec 2025 and built from the recovered P0 history. τ per SKU
comes from `optimise_tau` on the 2025 H2 validation window, using forecasts fitted to Jun 2025 only.
Everything is CALIBRATED SYNTHETIC and PRECOMPUTED.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import mcdm
from .generate import HOURS, World
from .optimise import AIPolicy, CostModel, TAU_GRID, per_series_cost, run_costs, smart_sourcing_suppliers
from .simulate import BaselinePolicy, SeriesParams, SupplyModel, simulate
from .reference import food_factor, transport_factor
from .world import SKUS, rng_for, suppliers

WARMUP = 28
TOPUP_KM = 30.0                         # wholesale market to dark store (ASSUMPTION)
P0_BUFFER_CV = 0.35                     # frontier: legacy buffer at the same service quantile, z(τ) × CV

POLICIES = (
    ("P0", "Baseline", "Legacy rule: 28-day moving average of recorded sales plus a fixed 20% buffer."),
    ("P1", "AI-Daily", "Demand recovery, quantile forecasts and an optimised service quantile, reviewed daily."),
    ("P2", "AI-Intraday", "P1 plus real-time stock visibility, a noon top-up and store-level spike response."),
    ("P3", "AI-Intraday + Smart Sourcing", "P2 plus a supplier mix chosen by multi-criteria ranking under disruption."),
)
WINDOWS = (
    ("test-2026", "Test window 2026", "2026-01-01", "2026-10-31", "The whole Jan-Oct 2026 test window."),
    ("normal", "Normal weeks", "2026-01-05", "2026-02-10", "Ordinary weeks before Ramadan 2026."),
    ("ramadan-2026", "Ramadan 2026", "2026-02-18", "2026-03-19", "Ramadan 2026 (real dates)."),
    ("stockpiling", "Stockpiling spike", "2026-03-01", "2026-03-07", "The unannounced March 2026 stockpiling wave."),
    ("hormuz", "Hormuz 2026", "2026-03-01", "2026-05-31", "The Hormuz disruption: late, short and missed imports."),
    ("summer", "Summer 2026", "2026-07-01", "2026-08-31", "The school summer break."),
)


@dataclass
class Context:
    """Everything a backtest needs, aligned to the horizon (index 0 = 2023-01-01)."""

    world: World
    config: dict
    catalog: dict
    fc: np.ndarray            # (buckets, 3, n, horizon days)
    profile: np.ndarray       # (n, horizon days, 24)
    tau: np.ndarray           # (n,)
    calibration: dict

    def h_index(self, date: str) -> int:
        return int(np.searchsorted(self.world.dates[self.world.horizon], pd.Timestamp(date)))


# --- Sub-worlds with redrawn demand noise ------------------------------------------------------------------------

def _intraday(calibration: dict, ramadan: np.ndarray) -> np.ndarray:
    normal = np.asarray(calibration["uae"]["intraday_profile_normal"]["values"], dtype=float)
    special = np.asarray(calibration["uae"]["intraday_profile_ramadan"]["values"], dtype=float)
    return np.where(ramadan[:, None], special / special.sum(), normal / normal.sum())


def sub_world(ctx: Context, start: str, end: str, run: int) -> tuple[World, int]:
    """The world restricted to [start − WARMUP, end]; run > 0 redraws daily and hourly demand noise.

    Returns (sub-world, horizon index of its first day)."""
    w = ctx.world
    h0 = ctx.h_index(start) - WARMUP
    h1 = ctx.h_index(end)
    a, b = w.n_warmup + h0, w.n_warmup + h1 + 1
    expected, multiplier = w.expected[:, a:b], w.multiplier[:, a:b]
    labels = w.day_labels.iloc[a:b].reset_index(drop=True)
    if run == 0:
        demand_h = w.demand_h[:, a:b]
    else:
        dcfg = ctx.config["world"]["demand"]
        level = w.expected[:, w.horizon].mean(axis=1)
        inv_r = np.maximum(dcfg["noise_cv"] ** 2 - 1.0 / level, 0.005)[:, None]
        rng = rng_for(w.seed, "mc-demand", run)
        intensity = rng.gamma(1.0 / inv_r, (expected.astype(float) * multiplier) * inv_r)
        alpha = ctx.config["world"]["demand"]["hourly_concentration"] * _intraday(
            ctx.calibration, labels["ramadan_day"].to_numpy() > 0)
        g = rng.gamma(np.broadcast_to(alpha, (expected.shape[0], *alpha.shape)))
        demand_h = rng.poisson(intensity[:, :, None] * g / g.sum(axis=2, keepdims=True)).astype(np.int32)
    sub = World(seed=w.seed, dates=w.dates[a:b], n_warmup=WARMUP, expected=expected, multiplier=multiplier,
                demand_h=demand_h, promo_depth=w.promo_depth[:, a:b], event_kind=w.event_kind[:, a:b],
                day_labels=labels, series_sku=w.series_sku, params=w.params)
    return sub, h0


# --- Policies ------------------------------------------------------------------------------------------------------

def supplier_factors() -> tuple[np.ndarray, np.ndarray]:
    """(landed-cost factor, transport kg CO2e per kg delivered) per supplier, in world.suppliers() order."""
    from .geography import SUPPLIER_ROUTES, route_distance_km

    routes = {r.supplier_id: r for r in SUPPLIER_ROUTES}
    ids = [s.id for s in suppliers()]
    factor = np.array([mcdm.LANDED_COST_FACTOR[i] for i in ids])
    co2 = np.array([route_distance_km(routes[i]) * transport_factor(routes[i].mode) / 1000.0 for i in ids])
    return factor, co2


def make_policy(policy_id: str, ctx: Context, sub: World, h0: int, supply: SupplyModel,
                tau: np.ndarray | None = None, p0_buffer: float | None = None):
    """Build P0-P3 for a sub-world (forecasts sliced to its days)."""
    if policy_id == "P0":
        base = BaselinePolicy.from_config(ctx.config)
        if p0_buffer is not None:
            base = BaselinePolicy(base.ma_days, p0_buffer, base.review_period, base.weekday_aware,
                                  base.shrink_allowance, base.min_cases, base.promo_uplift)
        return base
    days = len(sub.dates)
    fc = ctx.fc[:, :, :, h0:h0 + days]
    prof = ctx.profile[:, h0:h0 + days]
    store_of = np.arange(sub.n_series) // len(SKUS)
    alt = None
    if policy_id == "P3":
        ids = [s.id for s in suppliers()]
        disrupted = {s.id for s in suppliers() if s.disrupted is not None}
        alt = smart_sourcing_suppliers(sub.series_sku, ids, mcdm.ranking("hormuz2026"), disrupted)
    return AIPolicy(policy_id, fc, ctx.tau if tau is None else tau, supply, prof, store_of,
                    intraday=policy_id in ("P2", "P3"), alt_supplier=alt)


def run_policy(policy_id: str, ctx: Context, start: str, end: str, run: int, **kwargs):
    sub, h0 = sub_world(ctx, start, end, run)
    hz = ctx.config["world"]["hormuz_2026"]
    supply = SupplyModel.build(sub.dates, hz["start"], hz["end"])
    policy = make_policy(policy_id, ctx, sub, h0, supply, **kwargs)
    result = simulate(sub, policy, config=ctx.config, params=SeriesParams.from_catalogue(), supply=supply, run=run)
    return sub, result


# --- τ simulation-optimisation (P4-01) ----------------------------------------------------------------------------

def optimise_tau(ctx: Context, start: str, end: str, runs: int = 2) -> tuple[np.ndarray, dict]:
    """Per-series τ minimising total cost over [start, end] with P1, averaged over `runs` demand draws."""
    cost = CostModel.from_catalog(ctx.catalog, ctx.world.series_sku)
    n = ctx.world.n_series
    grid_cost = np.zeros((len(TAU_GRID), n))
    for i, tau in enumerate(TAU_GRID):
        for r in range(runs):
            sub, res = run_policy("P1", ctx, start, end, r, tau=np.full(n, tau))
            days = np.arange(len(sub.dates)) >= WARMUP
            grid_cost[i] += per_series_cost(res, sub.demand, cost, days) / runs
    best = np.array(TAU_GRID)[grid_cost.argmin(axis=0)]
    report = {"grid": list(TAU_GRID), "window": [start, end], "runs": runs,
              "total_cost_by_tau_AED": [round(float(c), 0) for c in grid_cost.sum(axis=1)],
              "best_uniform_tau": float(TAU_GRID[int(grid_cost.sum(axis=1).argmin())]),
              "per_sku_tau": {"p10": float(np.quantile(best, 0.1)), "p50": float(np.median(best)),
                              "p90": float(np.quantile(best, 0.9))},
              "cost_per_sku_vs_best_uniform": round(float(grid_cost.min(axis=0).sum()
                                                          / grid_cost.sum(axis=1).min() - 1.0), 4)}
    return best, report


# --- KPIs per window -----------------------------------------------------------------------------------------------

def _economics(ctx: Context) -> dict[str, np.ndarray]:
    factor, co2 = supplier_factors()
    sup_ids = [s.id for s in suppliers()]
    primary = np.array([sup_ids.index(SKUS[k].supplier_id) for k in ctx.world.series_sku])
    food = np.array([food_factor(SKUS[k].shelf_category) for k in ctx.world.series_sku])
    return {"cost": CostModel.from_catalog(ctx.catalog, ctx.world.series_sku), "factor": factor, "co2": co2,
            "primary": primary, "food": food, "topup_co2": TOPUP_KM * transport_factor("local_truck") / 1000.0}


def window_kpis(ctx: Context, sub: World, result, econ: dict, start: str, end: str,
                series: np.ndarray | None = None) -> dict[str, float]:
    days = np.asarray((sub.dates >= pd.Timestamp(start)) & (sub.dates <= pd.Timestamp(end)))
    return run_costs(result, sub.demand, econ["cost"], econ["factor"], econ["primary"], econ["co2"], econ["food"],
                     days, series, econ["topup_co2"])


def monte_carlo(ctx: Context, runs: int, start: str = "2026-01-01", end: str = "2026-10-31",
                log=None) -> dict[str, dict[str, list[dict]]]:
    """KPIs per (window, policy) for each run: {window: {policy: [kpis per run]}}."""
    econ = _economics(ctx)
    out: dict[str, dict[str, list[dict]]] = {w[0]: {p[0]: [] for p in POLICIES} for w in WINDOWS}
    for r in range(runs):
        for pid, _, _ in POLICIES:
            sub, res = run_policy(pid, ctx, start, end, r)
            for wid, _, ws, we, _ in WINDOWS:
                out[wid][pid].append(window_kpis(ctx, sub, res, econ, ws, we))
        if log and (r + 1) % 10 == 0:
            log(f"monte carlo: {r + 1}/{runs} runs")
    return out


def _dist(values: list[float]) -> dict[str, float]:
    v = np.asarray(values, dtype=float)
    return {"p10": round(float(np.quantile(v, 0.1)), 3), "p50": round(float(np.median(v)), 3),
            "p90": round(float(np.quantile(v, 0.9)), 3)}


KPI_KEYS = ("availabilityPct", "fillRatePct", "lostSalesUnits", "lostSalesAED", "wasteKg", "wastePctOfReceipts",
            "holdingAED", "expediteAED", "totalCostAED", "co2eKg", "daysOfCover")


def backtest_body(mc: dict[str, dict[str, list[dict]]]) -> dict[str, object]:
    """The backtest.json body (contract: results.ts, BacktestFile)."""
    results = []
    for wid, by_policy in mc.items():
        for pid, runs in by_policy.items():
            results.append({"windowId": wid, "policyId": pid, "runs": len(runs),
                            "kpis": {k: _dist([r[k] for r in runs]) for k in KPI_KEYS}})
    return {"windows": [{"id": w[0], "label": w[1], "range": {"start": w[2], "end": w[3]}, "description": w[4]}
                        for w in WINDOWS],
            "policies": [{"id": p[0], "label": p[1], "description": p[2]} for p in POLICIES], "results": results}


def paired_summary(mc: dict[str, dict[str, list[dict]]]) -> dict[str, object]:
    """Median paired change vs P0 per window and policy (plan §1.2 business targets)."""
    out = {}
    for wid, by_policy in mc.items():
        base = by_policy["P0"]
        out[wid] = {}
        for pid, runs in by_policy.items():
            if pid == "P0":
                continue
            lost = [r["lostSalesUnits"] / b["lostSalesUnits"] - 1 for r, b in zip(runs, base)]
            waste = [r["wasteKg"] / b["wasteKg"] - 1 for r, b in zip(runs, base)]
            cost = [r["totalCostAED"] / b["totalCostAED"] - 1 for r, b in zip(runs, base)]
            out[wid][pid] = {"lostSalesChange": _dist(lost), "wasteChange": _dist(waste), "totalCostChange": _dist(cost),
                             "lowerCostInRunsShare": round(float(np.mean(np.array(cost) < 0)), 3)}
    return out


# --- Frontier ------------------------------------------------------------------------------------------------------

def frontier_body(ctx: Context, start: str = "2026-01-01", end: str = "2026-10-31") -> dict[str, object]:
    """Service quantile vs availability, waste and cost, for P0 (buffer at the same quantile) and P1 (frontier.json)."""
    from scipy.stats import norm

    econ = _economics(ctx)
    n = ctx.world.n_series
    curves = []
    for pid in ("P0", "P1"):
        points = []
        for tau in TAU_GRID:
            kwargs = ({"p0_buffer": float(norm.ppf(tau)) * P0_BUFFER_CV} if pid == "P0" else {"tau": np.full(n, tau)})
            sub, res = run_policy(pid, ctx, start, end, 0, **kwargs)
            k = window_kpis(ctx, sub, res, econ, start, end)
            points.append({"serviceTarget": tau, "availabilityPct": round(k["availabilityPct"], 3),
                           "wastePct": round(k["wastePctOfReceipts"], 3), "totalCostAED": round(k["totalCostAED"], 0)})
        curves.append({"policyId": pid, "points": points})
    return {"scope": ("All 320 store-SKU series, Jan-Oct 2026 test window, generated demand (run 0). P0 points set the "
                      "legacy buffer to z(τ) × 0.35; P1 points use one τ for every SKU."),
            "curves": curves,
            "recommended": {"policyId": "P1", "serviceTarget": float(np.median(ctx.tau))}}

"""Fidelity report: the synthetic world under the P0 baseline, against the real calibration bands (P2-03).

Every synthetic statistic is measured with the SAME functions that measured the real data in Part 1
(`clean.HourlyAccumulator`, `calibrate.frn_weekly_index`, `calibrate.frn_cv`, `calibrate.rolling_ratio`),
and on the same quantity an analyst would see in real data: recorded sales and stock flags, not the
hidden true demand. Bands come from `calibration.json` (`target_bands`, docs/03-data-inspection.md §7).

Each check states its basis:
- "emergent": nothing was tuned to hit it, so passing it is evidence the world behaves realistically;
- "tuned": a named parameter was set to land in the band (listed in `tunedParameters`);
- "anchored": an amplitude was solved to match a cited figure.

Output: data/processed/fidelity_report.json (committed; report Appendix A).
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from . import __version__
from .artefacts import DUBAI
from .calibrate import frn_cv, frn_weekly_index, rolling_ratio
from .clean import HourlyAccumulator, first_stockout_hour, stockout_hours
from .config import load_config, repo_path
from .generate import HOURS, World
from .simulate import RunResult, daily_table
from .world import CATEGORIES, SKUS, STORES, loss_target_pct

REPORT_VERSION = "1.0"
VEGETABLE_CATEGORIES = ("leafy-greens", "salad-vegetables")
ANCHOR_TOLERANCE = {"ramadan_share": 0.005, "ramadan_2026_yoy": 0.002}
#: Why the spike bands are checked on generated demand (decision D-23).
SPIKE_NOTE = ("The band is a property of demand (plan §3.3). The Kaggle store bought stock daily and could stock up "
              "before known peaks, so its sales show demand spikes; the festival-blind P0 rule caps them in "
              "recorded sales (here {}).")

TUNED_PARAMETERS = [
    {"parameter": "world.demand.noise_cv = 0.34", "file": "pipeline/config.yaml",
     "target": "series_cv, morning_demand_ratio"},
    {"parameter": "world.promotions.episodes_per_year = 16", "file": "pipeline/config.yaml",
     "target": "series_cv (announced promotions add variation the P0 rule partly anticipates)"},
    {"parameter": "world.demand.store_shock_sd = 0.11; store_event_rate_per_year = 5; store_event_median = 1.7",
     "file": "pipeline/config.yaml", "target": "background_spike_p95, background_spike_p99"},
    {"parameter": "world.demand.item_spike_* (rate 0.012, median 1.8x)", "file": "pipeline/config.yaml",
     "target": "item-level spike quantiles (diagnostic only)"},
    {"parameter": "world.handling_concentration = 3", "file": "pipeline/config.yaml",
     "target": "morning_demand_ratio (batch-to-batch quality variation)"},
    {"parameter": "Category.handling_loss: leafy greens 12.4%, salad vegetables 7.6%", "file": "pipeline/freshpipe/world.py",
     "target": "spoilage_leafy-greens, spoilage_salad-vegetables (real Kaggle loss rates)"},
    {"parameter": "SupplyTerms.p_miss (normal terms) = 0.7-1.0%", "file": "pipeline/freshpipe/world.py",
     "target": "all_day_outage_share"},
    {"parameter": "baseline_policy.minimum_presentation_cases = 1; shrink_allowance; promo_uplift = 0.25",
     "file": "pipeline/config.yaml",
     "target": "removes the zero-sales trap of the legacy rule (decision D-22); safety_buffer stays at the plan's 20%"},
]

ASSUMPTIONS = [
    "The operator, its stores, prices, case packs, base demand levels and suppliers are fictional (world.py).",
    "Ramadan-season interpretation of NielsenIQ's 19%: an 8-week season (2 weeks before Ramadan, Ramadan, the Eid al-Fitr week).",
    "Category weights for Ramadan, Eid al-Adha and stockpiling, the Eid dip scale (0.5 of the real FRN-LT Spring Festival dip), "
    "the National Day eve uplift and the summer-break dip (-10%).",
    "Weather coefficients (REAL, FRN-LT) are applied to deviations from the UAE seasonal norm, capped at ±6 °C and 20 mm.",
    "Promotions: 16 chain-wide episodes per SKU per year (about 30% of days), 3-7 days, 10-30% off; the response uses "
    "the REAL FRN-LT coefficients. The P0 rule plans a flat +25% for any promotion.",
    "The 2026 stockpiling wave starts on 1 March 2026 and lasts 7 days; its size is anchored to Worldpanel's +4.1%.",
    "Hormuz 2026 delivery terms (late, short and missed deliveries for sea and air importers, March-May 2026).",
    "Handling-loss rates outside the two vegetable categories (the real loss data covers vegetables only).",
    "The Ramadan intraday profile shift (calibration.json, flagged there).",
]


def _band_check(check_id: str, label: str, value: float, band: list[float] | float, basis: str,
                real: object, measured_on: str, note: str = "", upper_only: bool = False) -> dict[str, object]:
    if upper_only:
        passed = value <= float(band)
        band_out: object = {"max": float(band)}
    else:
        passed = band[0] <= value <= band[1]
        band_out = {"min": band[0], "max": band[1]}
    return {"id": check_id, "label": label, "synthetic": round(float(value), 4), "band": band_out,
            "pass": bool(passed), "basis": basis, "real": real, "measuredOn": measured_on, "note": note}


def hourly_statistics(run: RunResult) -> dict[str, object]:
    """Stock-flag statistics through the same accumulator used on FreshRetailNet (Part 1)."""
    h = run.horizon
    sales = run.sales_h[:, h].reshape(-1, HOURS).astype(np.float32)
    oos = run.oos_h[:, h].reshape(-1, HOURS)
    count = stockout_hours(oos)
    acc = HourlyAccumulator()
    acc.update(sales, oos, count, first_stockout_hour(oos))
    summary = acc.summary()
    summary["oos_hours_share"] = round(float(count.mean()) / 16, 4)
    return summary


def frn_style(daily: pd.DataFrame) -> pd.DataFrame:
    """The synthetic daily table renamed to FreshRetailNet's columns, for the Part 1 functions."""
    return pd.DataFrame({"store_id": daily["store_id"], "product_id": daily["sku_id"], "dt": daily["date"],
                         "sale_amount": daily["recorded_sales"].astype(float),
                         "all_day_outage": daily["all_day_outage"]})


def store_spikes(daily: pd.DataFrame, column: str) -> dict[str, float]:
    """Store-level day ÷ centred 28-day median (the Kaggle measure), pooled over stores."""
    totals = daily.groupby(["store_id", "date"])[column].sum().astype(float)
    pooled = pd.concat([rolling_ratio(s.droplevel(0)) for _, s in totals.groupby(level=0)]).dropna()
    return {f"p{q}": round(float(pooled.quantile(q / 100)), 4) for q in (50, 90, 95, 99)} | {
        "max": round(float(pooled.max()), 3)}


def item_spikes(daily: pd.DataFrame, column: str) -> dict[str, float]:
    """Item-level day ÷ centred 28-day median, for series whose median is at least 1 unit (as for Kaggle)."""
    out = []
    for _, g in daily.groupby("series"):
        values = g[column].astype(float).reset_index(drop=True)
        median = values.rolling(28, center=True, min_periods=14).median()
        out.append((values / median.where(median >= 1.0)).dropna())
    pooled = pd.concat(out)
    return {f"p{q}": round(float(pooled.quantile(q / 100)), 4) for q in (50, 90, 95, 99)}


def spoilage_by_category(daily: pd.DataFrame) -> pd.DataFrame:
    """Waste as % of received kg per category, with the split into handling loss and expiry."""
    kg = daily["sku_id"].map({s.id: s.kg_per_unit for s in SKUS})
    cat = daily["sku_id"].map({s.id: s.category_id for s in SKUS})
    frame = pd.DataFrame({"category": cat, "received": daily["receipts"] * kg,
                          "handling": daily["handling_loss"] * kg, "expired": daily["expired"] * kg})
    g = frame.groupby("category")[["received", "handling", "expired"]].sum()
    g["handling_pct"] = 100 * g["handling"] / g["received"]
    g["expiry_pct"] = 100 * g["expired"] / g["received"]
    g["total_pct"] = g["handling_pct"] + g["expiry_pct"]
    return g


def loss_targets(calibration: dict) -> dict[str, float]:
    """kg-weighted real loss target (%) per vegetable category, from the SKU mapping to Kaggle categories."""
    out = {}
    for cat in VEGETABLE_CATEGORIES:
        skus = [s for s in SKUS if s.category_id == cat]
        weights = np.array([s.base_daily * s.kg_per_unit for s in skus])
        targets = np.array([loss_target_pct(s, calibration) for s in skus])
        out[cat] = float(np.average(targets, weights=weights))
    return out


def window_kpis(daily: pd.DataFrame, start: str, end: str, sku_filter: list[str] | None = None) -> dict[str, float]:
    """Availability, fill rate and stockout-day share inside a date window (optionally for some SKUs)."""
    mask = (daily["date"] >= pd.Timestamp(start)) & (daily["date"] <= pd.Timestamp(end))
    if sku_filter is not None:
        mask &= daily["sku_id"].isin(sku_filter)
    w = daily.loc[mask]
    return {"availability": round(1 - float(w["stockout_hours"].mean()) / 16, 4),
            "fill_rate": round(float(w["recorded_sales"].sum() / w["true_demand"].sum()), 4),
            "stockout_day_share": round(float((w["stockout_hours"] > 0).mean()), 4)}


def build_report(world: World, run: RunResult, calibration: dict | None = None) -> dict[str, object]:
    """Compute every check and diagnostic. Pure function of the world, the run and the calibration."""
    calibration = calibration or json.loads((repo_path("processed") / "calibration.json").read_text(encoding="utf-8"))
    config = load_config()
    bands = calibration["target_bands"]
    real50, realt = calibration["frn50k"], calibration["frnlt"]
    daily = daily_table(run, world)
    hourly = hourly_statistics(run)
    by_hour = hourly["stockout_share_by_hour"]
    weekly = frn_weekly_index(frn_style(daily))
    cv = frn_cv(frn_style(daily))
    spikes_sales = store_spikes(daily, "recorded_sales")
    spikes_demand = store_spikes(daily, "true_demand")
    spoil = spoilage_by_category(daily)
    targets = loss_targets(calibration)
    stock_real = lambda key: {"frn50k": real50["stockouts"][key], "frnlt": realt["stockouts"][key]}  # noqa: E731

    checks = [
        _band_check("oos_hours_share", "Share of trading hours (06:00-21:59) out of stock", hourly["oos_hours_share"],
                    bands["oos_hours_share"], "emergent", stock_real("oos_hours_share"), "stock flags"),
        _band_check("days_with_stockout_share", "SKU-days with at least one stockout hour",
                    hourly["days_with_stockout_share"], bands["days_with_stockout_share"], "emergent",
                    stock_real("days_with_stockout_share"), "stock flags"),
        _band_check("all_day_outage_share", "SKU-days out of stock for all 16 trading hours",
                    hourly["all_day_outage_share"], bands["all_day_outage_share"], "tuned",
                    stock_real("all_day_outage_share"), "stock flags"),
        _band_check("stockout_share_07h", "Out of stock at 07:00 (excluding all-day outages)", by_hour[7],
                    bands["stockout_share_07h_max"], "emergent",
                    {"frn50k": real50["stockouts"]["stockout_share_by_hour_excl_all_day"][7],
                     "frnlt": realt["stockouts"]["stockout_share_by_hour_excl_all_day"][7]},
                    "stock flags", upper_only=True),
        _band_check("stockout_share_20h", "Out of stock at 20:00 (excluding all-day outages)", by_hour[20],
                    bands["stockout_share_20h"], "emergent",
                    {"frn50k": real50["stockouts"]["stockout_share_by_hour_excl_all_day"][20],
                     "frnlt": realt["stockouts"]["stockout_share_by_hour_excl_all_day"][20]}, "stock flags"),
        _band_check("morning_demand_ratio", "Morning sales on days that sell out after 14:00 vs fully in-stock days",
                    hourly["censoring"]["ratio"], bands["morning_demand_ratio_sold_out_later"], "emergent",
                    {"frn50k": real50["censoring"]["ratio"], "frnlt": realt["censoring"]["ratio"]},
                    "recorded hourly sales"),
        _band_check("weekend_day_index", "Weekend day index (Saturday and Sunday vs the weekly mean)",
                    float(np.mean(weekly[5:])), bands["weekend_day_index"], "emergent",
                    {"frn50k": round(float(np.mean(real50["weekly_index_mon_to_sun"][5:])), 4),
                     "frnlt": round(float(np.mean(realt["weekly_index_mon_to_sun"][5:])), 4)},
                    "recorded daily sales", "UAE weekend (Saturday-Sunday) vs the FreshRetailNet weekend."),
        _band_check("series_cv", "Median coefficient of variation of daily sales per series", cv["p50"],
                    bands["series_cv"], "tuned", {"frn50k": real50["series_cv"]["p50"], "frnlt": realt["series_cv"]["p50"]},
                    "recorded daily sales", "Over the full 1,400-day horizon."),
        _band_check("background_spike_p95", "Store day ÷ 28-day median, 95th percentile", spikes_demand["p95"],
                    bands["background_spike_p95"], "tuned",
                    {"kaggle": calibration["veg"]["spikes"]["store_daily_vs_28d_median"]["p95"]},
                    "true store demand (generator)", SPIKE_NOTE.format(spikes_sales["p95"])),
        _band_check("background_spike_p99", "Store day ÷ 28-day median, 99th percentile", spikes_demand["p99"],
                    bands["background_spike_p99"], "tuned",
                    {"kaggle": calibration["veg"]["spikes"]["store_daily_vs_28d_median"]["p99"]},
                    "true store demand (generator)", SPIKE_NOTE.format(spikes_sales["p99"])),
    ]
    for cat in VEGETABLE_CATEGORIES:
        checks.append(_band_check(f"spoilage_{cat}", f"Baseline spoilage, {cat} (% of received kg)",
                                  spoil.loc[cat, "total_pct"], bands["baseline_spoilage_pct_by_category"], "tuned",
                                  {"kaggle_target": round(targets[cat], 2)}, "simulated waste and receipts",
                                  f"Handling loss {spoil.loc[cat, 'handling_pct']:.2f}% + expiry "
                                  f"{spoil.loc[cat, 'expiry_pct']:.2f}%."))

    params = world.params
    fest = config["world"]["festivals"]
    anchors = [
        {"id": "ramadan_share", "label": "Ramadan-season share of annual demand (8-week season)",
         "target": fest["ramadan_share_target"], "synthetic": params["ramadan_share_achieved"],
         "tolerance": ANCHOR_TOLERANCE["ramadan_share"], "source": "communicate2026-nielseniq",
         "pass": abs(params["ramadan_share_achieved"] - fest["ramadan_share_target"]) <= ANCHOR_TOLERANCE["ramadan_share"],
         "note": f"Solved Ramadan amplitude {params['ramadan_amplitude']}; years {params['ramadan_share_years']}."},
        {"id": "ramadan_2026_yoy", "label": "Ramadan 2026 vs Ramadan 2025 mean daily volume",
         "target": config["world"]["stockpiling_2026"]["ramadan_yoy_target"],
         "synthetic": params["ramadan_2026_yoy_achieved"], "tolerance": ANCHOR_TOLERANCE["ramadan_2026_yoy"],
         "source": "rana2026-worldpanel",
         "pass": abs(params["ramadan_2026_yoy_achieved"] - config["world"]["stockpiling_2026"]["ramadan_yoy_target"])
         <= ANCHOR_TOLERANCE["ramadan_2026_yoy"],
         "note": f"Without the stockpiling wave: {params['ramadan_2026_yoy_without_stockpiling']}; "
                 f"solved wave amplitude {params['stockpiling_amplitude']}."},
    ]

    demand_total = float(daily["true_demand"].sum())
    hormuz = config["world"]["hormuz_2026"]
    sea_air = [s.id for s in SKUS if s.supplier_id.startswith(("sup-sea", "sup-air"))]
    in_stock_profile = np.asarray(hourly["in_stock_profile"])
    real_profile = np.asarray(calibration["uae"]["intraday_profile_normal"]["values"])
    real_first = np.asarray(real50["stockouts"]["first_stockout_hour_share"])
    syn_first = np.asarray(hourly["first_stockout_hour_share"])
    diagnostics = {
        "stockout_share_by_hour": {"synthetic": by_hour,
                                   "frn50k": real50["stockouts"]["stockout_share_by_hour_excl_all_day"]},
        "first_stockout_hour_share": {"synthetic": hourly["first_stockout_hour_share"],
                                      "frn50k": real50["stockouts"]["first_stockout_hour_share"],
                                      "correlation": round(float(np.corrcoef(syn_first[6:22], real_first[6:22])[0, 1]), 4)},
        "sales_share_in_stockout_hours": {"synthetic": hourly["sales_share_in_stockout_hours"],
                                          "frn50k": real50["stockouts"]["sales_share_in_stockout_hours"],
                                          "frnlt": realt["stockouts"]["sales_share_in_stockout_hours"]},
        "in_stock_intraday_profile_max_abs_diff": round(float(np.abs(in_stock_profile - real_profile).max()), 5),
        "weekly_index_recorded_sales": weekly,
        "series_cv_recorded_sales": cv,
        "store_spikes_recorded_sales": spikes_sales,
        "store_spikes_true_demand": spikes_demand,
        "item_spikes_recorded_sales": item_spikes(daily, "recorded_sales"),
        "item_spikes_kaggle": calibration["veg"]["spikes"]["item_daily_vs_28d_median"],
        "lost_demand_share": round(float(daily["lost_sales"].sum()) / demand_total, 4),
        "spoilage_pct_by_category": {c: {"handling": round(float(r.handling_pct), 2), "expiry": round(float(r.expiry_pct), 2),
                                         "total": round(float(r.total_pct), 2)} for c, r in spoil.iterrows()},
        "stockout_day_share_by_category": daily.assign(cat=daily["sku_id"].map({s.id: s.category_id for s in SKUS}))
            .groupby("cat")["stockout_hours"].apply(lambda s: round(float((s > 0).mean()), 4)).to_dict(),
        "stress_windows": {
            "before_hormuz_sea_air_skus": window_kpis(daily, "2025-12-01", "2026-02-28", sea_air),
            "hormuz_2026_sea_air_skus": window_kpis(daily, hormuz["start"], hormuz["end"], sea_air),
            "ramadan_2026_all": window_kpis(daily, "2026-02-18", "2026-03-19"),
            "summer_2025_all": window_kpis(daily, "2025-07-01", "2025-08-31"),
        },
    }
    passed = sum(c["pass"] for c in checks)
    return {
        "reportVersion": REPORT_VERSION,
        "generatedAt": datetime.now(DUBAI).replace(microsecond=0).isoformat(),
        "generator": f"freshpipe {__version__}",
        "seed": world.seed,
        "provenance": "CALIBRATED_SYNTHETIC",
        "policy": run.policy,
        "world": {"stores": len(STORES), "skus": len(SKUS), "categories": len(CATEGORIES), "series": world.n_series,
                  "days": int(len(world.dates) - world.n_warmup),
                  "horizon": {"start": str(world.dates[world.n_warmup].date()), "end": str(world.dates[-1].date())},
                  "hourlySteps": int(world.n_series * (len(world.dates) - world.n_warmup) * HOURS)},
        "summary": {"checks": len(checks), "passed": passed, "allPassed": passed == len(checks),
                    "anchors": len(anchors), "anchorsPassed": sum(a["pass"] for a in anchors)},
        "checks": checks,
        "anchors": anchors,
        "diagnostics": diagnostics,
        "tunedParameters": TUNED_PARAMETERS,
        "assumptions": ASSUMPTIONS,
    }


def write_report(report: dict[str, object], path: Path | None = None) -> Path:
    path = path or repo_path("processed") / "fidelity_report.json"
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return path

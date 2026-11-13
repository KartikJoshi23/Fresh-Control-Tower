"""Calibration (task P1-02): measure what the synthetic UAE world must reproduce.

Inputs are the cleaned tables from `clean.py`. The output is data/processed/calibration.json:
measured parameters (with method, sample size and source) and the target bands from
docs/03-data-inspection.md §7, plus external anchors from Gulf sources.

FreshRetailNet sales are scaled by an undisclosed coefficient, so only shares, ratios and
log-scale (multiplicative) effects are taken from it (rule C6). Unit economics and spoilage
come from the Kaggle vegetable data, which is in real kg and RMB.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .clean import VegClean

DUBAI = timezone(timedelta(hours=4))
CALIBRATION_VERSION = "1.0"

#: Lunar New Year (Spring Festival) day, used to measure a real festival's demand shape.
LUNAR_NEW_YEAR = {
    "veg": ["2021-02-12", "2022-02-01", "2023-01-22"],
    "frnlt": ["2024-02-10", "2025-01-29"],
}

#: Ramadan intraday shift. ASSUMPTION (no public UAE hourly data found): demand moves from late
#: morning towards the pre-iftar afternoon and late evening. Multipliers are applied to the normal
#: profile and the result is renormalised. The dashboard's Ramadan-intensity control can stress-test it.
RAMADAN_HOUR_MULTIPLIERS = {9: 0.8, 10: 0.8, 11: 0.8, 12: 0.8, 13: 0.8, 16: 1.3, 17: 1.3, 18: 1.3,
                            21: 1.5, 22: 1.5, 23: 1.5, 0: 1.5}

#: External anchors from Gulf sources (ids resolve in freshpipe.sources).
ANCHORS = {
    "ramadan_share_of_annual_fmcg_sales_mena": {
        "value": 0.19, "source": "communicate2026-nielseniq",
        "note": "NielsenIQ: Ramadan contributes nearly 19% of annual FMCG sales across MENA. The article does "
                "not define how many weeks count as the Ramadan period, so Part 2 documents its interpretation."},
    "ramadan_2025_fmcg_value_growth_mena": {
        "value": 0.202, "source": "communicate2026-nielseniq", "note": "Ramadan 2025 vs Ramadan 2024 (value)."},
    "uae_ramadan_2026_fmcg_volume_growth": {
        "value": 0.041, "source": "rana2026-worldpanel",
        "note": "Volume +4.1% vs the previous year; volumes peaked in March 2026 as Ramadan coincided with crisis stockpiling."},
    "uae_food_import_share": {
        "value": [0.85, 0.90], "source": "sohail2026-gulf-business", "note": "Quoted range (United Foods CEO)."},
    "uae_food_imports_via_bab_el_mandeb_share": {
        "value": 0.70, "source": "fathallah2024-atlantic-council", "note": "About 70% of UAE food imports."},
    "hormuz_daily_transit_change_mar_may_2026": {
        "value": -0.951, "source": "goharbakhsh2026-hormuz", "verified": True,
        "note": "Paper abstract (via Crossref): daily Hormuz transits fell 95.1% during the March–May 2026 peak "
                "(dry bulk -88.8%). The same study finds food-price impacts statistically indistinguishable "
                "from zero (all p > 0.05), so the shock is modelled through availability and lead times, not prices."},
    "fresh_transit_time_increase_2026": {
        "value": "several days", "source": "sohail2026-gulf-business",
        "note": "Some fresh categories (berries, leafy greens, stone fruit hit hardest)."},
}

#: Target bands for the baseline (P0) synthetic world (docs/03-data-inspection.md §7).
TARGET_BANDS = {
    "oos_hours_share": [0.15, 0.25],
    "days_with_stockout_share": [0.35, 0.50],
    "all_day_outage_share": [0.02, 0.06],
    "stockout_share_07h_max": 0.05,
    "stockout_share_20h": [0.25, 0.40],
    "morning_demand_ratio_sold_out_later": [1.15, 1.50],
    # Weekend day's demand divided by the weekly mean (the inspection's 1.18–1.28 indices), not a weekend/weekday ratio.
    "weekend_day_index": [1.15, 1.30],
    "series_cv": [0.4, 0.7],
    "background_spike_p95": [1.4, 1.8],
    "background_spike_p99": [1.8, 2.4],
    "baseline_spoilage_pct_by_category": [6.0, 14.0],
}


# --- Generic helpers ------------------------------------------------------------------------------

def quantiles(values: pd.Series | np.ndarray, qs: tuple[float, ...] = (0.1, 0.5, 0.9)) -> dict[str, float]:
    """Named quantiles (p10, p50, …) rounded to 4 decimals, ignoring NaN."""
    clean = pd.Series(values).dropna()
    return {f"p{int(round(q * 100))}": round(float(clean.quantile(q)), 4) for q in qs}


def within_series_ols(frame: pd.DataFrame, y: str, regressors: list[str], group: list[str]) -> dict[str, object]:
    """OLS with series fixed effects (within transformation): demean y and X inside each group.

    Returns coefficients, the within R², and the sample size. Used for multiplicative effects on log sales.
    """
    cols = [y, *regressors]
    data = frame[group + cols].dropna()
    demeaned = data[cols].astype(np.float64) - data.groupby(group, observed=True)[cols].transform("mean")
    x = demeaned[regressors].to_numpy()
    target = demeaned[y].to_numpy()
    coef, *_ = np.linalg.lstsq(x, target, rcond=None)
    residual = target - x @ coef
    r2 = 1.0 - float(residual @ residual) / float(target @ target) if float(target @ target) > 0 else 0.0
    return {"coefficients": {name: round(float(c), 6) for name, c in zip(regressors, coef)},
            "r2_within": round(r2, 4), "n": int(len(data))}


def normalised_by_series(daily: pd.DataFrame, value: str = "sale_amount",
                         group: tuple[str, ...] = ("store_id", "product_id")) -> pd.Series:
    """Each row's value divided by its series mean. This removes level and scale differences."""
    means = daily.groupby(list(group), observed=True)[value].transform("mean")
    return daily[value] / means.where(means > 0)


def rolling_ratio(series: pd.Series, window: int = 28, min_periods: int = 14) -> pd.Series:
    """Value divided by its centred rolling median. NaN (closed) days are skipped by the median."""
    median = series.rolling(window, center=True, min_periods=min_periods).median()
    return series / median.where(median > 0)


def festival_shape(daily: pd.Series, event_dates: list[str], before: int = 14, after: int = 14,
                   baseline: tuple[int, int] = (-42, -15)) -> dict[str, object]:
    """Daily value relative to a pre-event baseline, for offsets -before…+after, averaged across events.

    `daily` is a date-indexed series (NaN = closed). The baseline is the mean over the `baseline`
    offset window before each event.
    """
    offsets = list(range(-before, after + 1))
    per_event = []
    for event in event_dates:
        day0 = pd.Timestamp(event)
        base = daily[(daily.index >= day0 + pd.Timedelta(days=baseline[0]))
                     & (daily.index <= day0 + pd.Timedelta(days=baseline[1]))].mean()
        per_event.append([daily.get(day0 + pd.Timedelta(days=o), np.nan) / base for o in offsets])
    matrix = np.array(per_event, dtype=float)
    finite = np.isfinite(matrix)
    counts = finite.sum(axis=0)
    # Offsets where every event is closed (for example Lunar New Year's Eve) stay NaN, without an empty-mean warning.
    mean = np.divide(np.where(finite, matrix, 0.0).sum(axis=0), counts,
                     out=np.full(len(offsets), np.nan), where=counts > 0)

    def window_mean(values: np.ndarray) -> float:
        valid = values[np.isfinite(values)]
        return float(valid.mean()) if valid.size else float("nan")

    pre_week = window_mean(mean[before - 7:before])
    post_week = window_mean(mean[before + 1:before + 8])
    return {"offsets": offsets, "mean_index": [None if np.isnan(v) else round(float(v), 3) for v in mean],
            "pre_week_index": round(pre_week, 3), "post_week_index": round(post_week, 3),
            "events": event_dates}


# --- FreshRetailNet ---------------------------------------------------------------------------------

def frn_effects(daily: pd.DataFrame) -> dict[str, object]:
    """Promotion, weather and calendar effects on log sales, on fully in-stock days only.

    Restricting to in-stock days avoids censoring bias (stockouts cap sales on exactly the busy days).
    """
    sample = daily.loc[(daily["oos_hours"] == 0) & (daily["sale_amount"] > 0)].copy()
    sample["log_sales"] = np.log(sample["sale_amount"].astype(np.float64))
    sample["discount_depth"] = 1.0 - sample["discount"].astype(np.float64)
    regressors = ["discount_depth", "activity_flag", "avg_temperature", "precpt", "is_weekend", "is_public_holiday"]
    for name in ("activity_flag", "is_weekend", "is_public_holiday"):
        sample[name] = sample[name].astype(np.float64)
    fit = within_series_ols(sample, "log_sales", regressors, ["store_id", "product_id"])
    c = fit["coefficients"]
    fit["multipliers"] = {
        "per_10pct_discount": round(float(np.exp(0.1 * c["discount_depth"])), 4),
        "activity_day": round(float(np.exp(c["activity_flag"])), 4),
        "per_degree_c": round(float(np.exp(c["avg_temperature"])), 4),
        "per_10mm_precipitation": round(float(np.exp(10 * c["precpt"])), 4),
        "weekend": round(float(np.exp(c["is_weekend"])), 4),
        "public_holiday": round(float(np.exp(c["is_public_holiday"])), 4),
    }
    fit["temperature_range_c"] = [round(float(sample["avg_temperature"].min()), 1),
                                  round(float(sample["avg_temperature"].max()), 1)]
    return fit


def frn_weekly_index(daily: pd.DataFrame) -> list[float]:
    """Mean within-series normalised sales by weekday (Monday = 0), excluding all-day outages."""
    usable = daily.loc[~daily["all_day_outage"]]
    norm = normalised_by_series(usable)
    index = norm.groupby(usable["dt"].dt.dayofweek).mean()
    return [round(float(v), 4) for v in (index / index.mean()).sort_index()]


def frn_monthly_index(daily: pd.DataFrame) -> dict[str, float]:
    """Mean within-series normalised sales by calendar month (reduces composition effects)."""
    usable = daily.loc[~daily["all_day_outage"]]
    norm = normalised_by_series(usable)
    index = norm.groupby(usable["dt"].dt.to_period("M")).mean()
    return {str(k): round(float(v), 4) for k, v in (index / index.mean()).items()}


def frn_daily_index(daily: pd.DataFrame) -> pd.Series:
    """Date-indexed mean of within-series normalised sales (for festival shapes)."""
    usable = daily.loc[~daily["all_day_outage"]]
    norm = normalised_by_series(usable)
    return norm.groupby(usable["dt"]).mean().sort_index()


def frn_cv(daily: pd.DataFrame) -> dict[str, float]:
    """Distribution of each series' coefficient of variation of daily sales (all-day outages excluded)."""
    usable = daily.loc[~daily["all_day_outage"]]
    grouped = usable.groupby(["store_id", "product_id"], observed=True)["sale_amount"]
    cv = grouped.std() / grouped.mean()
    return quantiles(cv.replace([np.inf, -np.inf], np.nan))


def frn_section(daily: pd.DataFrame, hourly: dict[str, object], *, seasonality: bool) -> dict[str, object]:
    """All calibration measurements for one FreshRetailNet release."""
    stock_by_hour = hourly["stockout_share_by_hour"]
    section: dict[str, object] = {
        "stockouts": {
            "oos_hours_share": round(float(daily["oos_hours"].mean()) / 16, 4),
            "days_with_stockout_share": hourly["days_with_stockout_share"],
            "all_day_outage_share": hourly["all_day_outage_share"],
            "stockout_share_by_hour_excl_all_day": stock_by_hour,
            "first_stockout_hour_share": hourly["first_stockout_hour_share"],
            "sales_share_in_stockout_hours": hourly["sales_share_in_stockout_hours"],
        },
        "censoring": hourly["censoring"],
        "intraday_profile_in_stock_days": hourly["in_stock_profile"],
        "intraday_profile_raw_sales": hourly["raw_sales_profile"],
        "weekly_index_mon_to_sun": frn_weekly_index(daily),
        "series_cv": frn_cv(daily),
        "effects_log_sales": frn_effects(daily),
    }
    if seasonality:
        section["monthly_index_within_series"] = frn_monthly_index(daily)
        section["spring_festival_shape"] = festival_shape(frn_daily_index(daily), LUNAR_NEW_YEAR["frnlt"])
    return section


# --- Kaggle vegetables --------------------------------------------------------------------------------

def veg_section(veg: VegClean) -> dict[str, object]:
    """Unit economics, spoilage, spikes, festival shape and seasonality from the vegetable data."""
    item_day = veg.item_day
    valid = item_day.dropna(subset=["avg_price", "wholesale"])
    valid = valid.loc[~valid["clearance"] & (valid["wholesale"] > 0)]
    ratio = valid["avg_price"] / valid["wholesale"]
    markups = {"overall": quantiles(ratio),
               "by_category": {cat: quantiles(r) for cat, r in ratio.groupby(valid["category_name"])},
               "n_item_days": int(len(valid))}

    sold_kg = item_day.groupby("item")["net_kg"].sum().rename("kg")
    loss = veg.loss.merge(sold_kg, on="item", how="left").fillna({"kg": 0.0})
    weighted = loss.groupby("category_name").apply(
        lambda g: float(np.average(g["loss_rate_pct"], weights=g["kg"])) if g["kg"].sum() > 0 else float("nan"),
        include_groups=False)
    spoilage = {"kg_weighted_pct_by_category": {k: round(v, 2) for k, v in weighted.items()},
                "kg_weighted_pct_overall": round(float(np.average(loss["loss_rate_pct"], weights=loss["kg"])), 2),
                "item_quantiles_pct": quantiles(loss["loss_rate_pct"])}

    daily_kg = veg.daily["kg"]
    store_ratio = rolling_ratio(daily_kg)
    item_series = item_day.pivot_table(index="date", columns="item", values="net_kg", aggfunc="sum")
    item_series = item_series.reindex(daily_kg.index)
    item_median = item_series.rolling(28, center=True, min_periods=14).median()
    item_ratio = (item_series / item_median.where(item_median >= 1.0)).stack()
    years = (daily_kg.index.max() - daily_kg.index.min()).days / 365.25
    spikes = {
        "store_daily_vs_28d_median": quantiles(store_ratio, (0.5, 0.9, 0.95, 0.99)) | {
            "max": round(float(store_ratio.max()), 3),
            "max_date": str(store_ratio.idxmax().date()),
            "days_per_year_above_1_5": round(float((store_ratio > 1.5).sum()) / years, 2),
            "days_per_year_above_2_0": round(float((store_ratio > 2.0).sum()) / years, 2)},
        "item_daily_vs_28d_median": quantiles(item_ratio, (0.5, 0.9, 0.95, 0.99)) | {
            "n_item_days": int(item_ratio.notna().sum())},
    }

    weekday = daily_kg.groupby(daily_kg.index.dayofweek).mean()
    tx = veg.transactions
    positive = tx.loc[(tx["qty_kg_capped"] > 0) & tx["hour"].notna()]
    hourly_kg = positive.groupby(positive["hour"].astype(int))["qty_kg_capped"].sum().reindex(range(24), fill_value=0.0)
    year_norm = daily_kg / daily_kg.groupby(daily_kg.index.year).transform("mean")
    monthly = year_norm.groupby(daily_kg.index.month).mean()
    return {
        "markup_retail_over_wholesale": markups,
        "spoilage": spoilage,
        "spikes": spikes,
        "lunar_new_year_shape": festival_shape(daily_kg, LUNAR_NEW_YEAR["veg"]),
        "weekly_index_mon_to_sun": [round(float(v), 4) for v in (weekday / weekday.mean()).sort_index()],
        "monthly_index_within_year": {int(k): round(float(v), 4) for k, v in (monthly / monthly.mean()).items()},
        "intraday_profile_kg": (hourly_kg / hourly_kg.sum()).round(5).tolist(),
        "closure_days": int(veg.daily["closed"].sum()),
    }


# --- UAE mapping -----------------------------------------------------------------------------------------

def uae_weekly_index(frn50k_weekly: list[float], frnlt_weekly: list[float], veg_weekly: list[float]) -> dict[str, object]:
    """Map the measured weekday pattern onto the UAE week (Saturday–Sunday weekend since 2022).

    Mon–Thu take the mean measured weekday level and Sat–Sun the mean measured weekend level.
    Friday is set halfway between them, an ASSUMPTION reflecting the UAE half-day Friday.
    """
    sets = [frn50k_weekly, frnlt_weekly, veg_weekly]
    weekday = float(np.mean([np.mean(s[:5]) for s in sets]))
    weekend = float(np.mean([np.mean(s[5:]) for s in sets]))
    week = [weekday] * 4 + [(weekday + weekend) / 2] + [weekend] * 2
    mean = float(np.mean(week))
    return {"index_mon_to_sun": [round(v / mean, 4) for v in week],
            "weekend_uplift_vs_weekday": round(weekend / weekday, 4),
            "note": "Mon-Thu = measured weekday level; Sat-Sun = measured weekend level; "
                    "Friday halfway between them (assumption: UAE half-day Friday)."}


def ramadan_profile(normal: list[float]) -> list[float]:
    """Apply RAMADAN_HOUR_MULTIPLIERS to a normal intraday profile and renormalise (ASSUMPTION)."""
    shifted = np.array([p * RAMADAN_HOUR_MULTIPLIERS.get(h, 1.0) for h, p in enumerate(normal)])
    return (shifted / shifted.sum()).round(5).tolist()


def assemble_calibration(s50k: dict[str, object], slt: dict[str, object], sveg: dict[str, object],
                         inputs: dict[str, int]) -> dict[str, object]:
    """Assemble calibration.json from per-dataset sections.

    Sections are computed one dataset at a time (see run.py), so the two large FreshRetailNet tables
    are never in memory together.
    """
    normal_profile = s50k["intraday_profile_in_stock_days"]
    return {
        "calibrationVersion": CALIBRATION_VERSION,
        "generatedAt": datetime.now(DUBAI).replace(microsecond=0).isoformat(),
        "inputs_bytes": inputs,
        "notes": [
            "FreshRetailNet sales are scaled, so only shares, ratios and log-scale effects are used from it (rule C6).",
            "Effects on log sales use fully in-stock days only, to avoid censoring bias.",
            "Values marked ASSUMPTION have no public source; each is listed with its reason.",
        ],
        "frn50k": {"source": "dingdong2025-frn50k"} | s50k,
        "frnlt": {"source": "dingdong2026-frnlt"} | slt,
        "veg": {"source": "yapwh2023-vegetables"} | sveg,
        "uae": {
            "weekly": uae_weekly_index(s50k["weekly_index_mon_to_sun"], slt["weekly_index_mon_to_sun"],
                                       sveg["weekly_index_mon_to_sun"]),
            "intraday_profile_normal": {"values": normal_profile, "source": "dingdong2025-frn50k",
                                        "method": "FreshRetailNet-50K hourly sales on fully in-stock days (uncensored)."},
            "intraday_profile_ramadan": {"values": ramadan_profile(normal_profile), "assumption": True,
                                         "multipliers": {str(k): v for k, v in RAMADAN_HOUR_MULTIPLIERS.items()},
                                         "method": "Normal profile reweighted towards pre-iftar and late evening (assumption)."},
        },
        "anchors": ANCHORS,
        "target_bands": TARGET_BANDS,
    }

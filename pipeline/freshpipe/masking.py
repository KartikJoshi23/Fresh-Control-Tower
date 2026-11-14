"""Real-data validation on FreshRetailNet-50K (task P3-02, plan §3.5) → web/public/data/realdata.json.

The real data has no true demand, so recovery is tested on days where it is known:

1. **Masking test.** Fully in-stock series-days (no stockout hour in 24 h) from the last 30 training
   days get an artificial stockout: a first stockout hour is drawn from the REAL distribution of first
   stockout hours (partial-stockout days, 07:00-21:00) and every later hour is hidden. Real stockouts
   are contiguous in 88-99% of cases once they start (measured), so masking to midnight is realistic.
   Profile recovery (`recover.profile_recovery`) then estimates the hidden sales, which are known.
   Profiles come from the first 60 days only, so the test days never shape their own profile.
2. **Forecast bias test.** The same global gradient-boosted forecaster is trained twice on the 90-day
   training split: on raw (censored) daily sales and on recovered demand. Both forecast the 7-day
   evaluation split. Truth on those days is censored too, so both are scored only on **in-stock hours**:
   forecast × the profile mass of the in-stock hours vs the sales in those hours. This uses only hours
   where sales = demand, and keeps the busy days (dropping whole stockout days would bias the truth low).

FreshRetailNet sales are scaled by an undisclosed coefficient, so only ratios (WAPE, WPE) are reported.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.compute as pc
import pyarrow.parquet as pq

from . import recover
from .clean import TRADING_HOURS

HOURS = 24
COLUMNS = ("store_id", "product_id", "first_category_id", "dt", "hours_sale", "hours_stock_status", "discount",
           "holiday_flag", "activity_flag", "precpt", "avg_temperature")
FIT_DAYS = 60                 # profiles: the first 60 training days (28 Mar - 26 May 2024)
FIRST_MASK_HOUR = 7           # 06:00 stockouts are mostly pre-restock morning gaps (35.6% contiguous), so excluded
LAGS = (7, 14, 21, 28)        # forecast lags: at least the 7-day horizon (plan §3.6)
CHUNK = 10_000                # series per recovery chunk (bounds memory)


@dataclass
class FrnCube:
    """A FreshRetailNet split as dense arrays: [series, day(, hour)], series sorted by (store, product)."""

    keys: pd.DataFrame          # store_id, product_id, first_category_id per series
    dates: pd.DatetimeIndex
    sales: np.ndarray           # (n, d, 24) float32
    oos: np.ndarray             # (n, d, 24) bool, True = out of stock (cleaning rule C1)
    daily: dict[str, np.ndarray]  # (n, d) covariates: discount, holiday_flag, activity_flag, precpt, avg_temperature


def load_cube(path: Path) -> FrnCube:
    """Read a FreshRetailNet-50K split into dense arrays. Every series must cover every date (true for 50K)."""
    table = pq.read_table(path, columns=list(COLUMNS))
    frame = pd.DataFrame({c: table[c].to_numpy() for c in COLUMNS if c not in ("hours_sale", "hours_stock_status")})
    order = np.lexsort((frame["dt"].to_numpy(), frame["product_id"].to_numpy(), frame["store_id"].to_numpy()))
    sales = pc.list_flatten(table["hours_sale"]).to_numpy().reshape(-1, HOURS).astype(np.float32)[order]
    status = pc.list_flatten(table["hours_stock_status"]).to_numpy().reshape(-1, HOURS)[order]
    frame = frame.iloc[order].reset_index(drop=True)
    dates = pd.DatetimeIndex(sorted(frame["dt"].unique()))
    n_days = len(dates)
    if len(frame) % n_days:
        raise ValueError("series do not all cover the same dates")
    n = len(frame) // n_days
    keys = frame.iloc[::n_days][["store_id", "product_id", "first_category_id"]].reset_index(drop=True)
    daily = {c: frame[c].to_numpy(dtype=float).reshape(n, n_days)
             for c in ("discount", "holiday_flag", "activity_flag", "precpt", "avg_temperature")}
    daily["discount"] = np.where(daily["discount"] == 0.0, np.nan, np.minimum(daily["discount"], 1.0))  # rule C4
    return FrnCube(keys, dates, sales.reshape(n, n_days, HOURS), (status == 1).reshape(n, n_days, HOURS), daily)


def group_codes(keys: pd.DataFrame) -> np.ndarray:
    return pd.factorize(keys["first_category_id"])[0]


def first_hour_distribution(oos: np.ndarray) -> np.ndarray:
    """Share of partial-stockout days whose first trading-hour stockout is at each hour (07:00-21:00)."""
    window = oos[:, :, TRADING_HOURS].reshape(-1, TRADING_HOURS.stop - TRADING_HOURS.start)
    partial = window.any(axis=1) & ~window.all(axis=1)
    first = window[partial].argmax(axis=1) + TRADING_HOURS.start
    counts = np.bincount(first, minlength=HOURS).astype(float)
    counts[:FIRST_MASK_HOUR] = 0.0
    return counts / counts.sum()


def _recover_in_chunks(sales: np.ndarray, oos: np.ndarray, prof: np.ndarray, alpha: float) -> np.ndarray:
    """Profile recovery, CHUNK series at a time. Returns recovered hourly demand (float32)."""
    out = np.empty(sales.shape, dtype=np.float32)
    for lo in range(0, sales.shape[0], CHUNK):
        part = slice(lo, lo + CHUNK)
        out[part] = recover.profile_recovery(sales[part], oos[part], prof[part], alpha=alpha).hourly
    return out


def _mask(cube: FrnCube, days: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Artificial stockouts on fully in-stock series-days inside `days`: (masked hours, series idx, day idx)."""
    candidates = recover.fully_in_stock(cube.oos) & days[None, :]
    s_idx, t_idx = np.nonzero(candidates)
    first = rng.choice(HOURS, size=s_idx.size, p=first_hour_distribution(cube.oos))
    masked = np.zeros(cube.sales.shape, dtype=bool)
    masked[s_idx, t_idx] = np.arange(HOURS)[None, :] >= first[:, None]
    return masked, s_idx, t_idx


def _score_mask(cube: FrnCube, prof: np.ndarray, masked: np.ndarray, s_idx: np.ndarray, t_idx: np.ndarray,
                alpha: float) -> dict[str, float]:
    oos = cube.oos | masked
    sales = np.where(masked, 0.0, cube.sales).astype(np.float32)
    rec = _recover_in_chunks(sales, oos, prof, alpha)
    truth_hidden = (cube.sales * masked).sum(axis=2)[s_idx, t_idx].astype(float)
    rec_hidden = (rec * masked).sum(axis=2)[s_idx, t_idx].astype(float)
    # Oracle floor: the TRUE day total split by the profile. No method that only knows the day level can beat it.
    oracle = cube.sales.sum(axis=2)[s_idx, t_idx] * (prof[s_idx, t_idx] * masked[s_idx, t_idx]).sum(axis=1)
    return {"hidden_wape": round(recover.wape(rec_hidden, truth_hidden), 4),
            "hidden_wpe": round(recover.wpe(rec_hidden, truth_hidden), 4),
            "hourly_wape": round(recover.wape(rec[masked].astype(float), cube.sales[masked].astype(float)), 4),
            "oracle_hidden_wape": round(recover.wape(oracle.astype(float), truth_hidden), 4)}


def masking_test(cube: FrnCube, seed: int, alpha: float = recover.DEFAULT_ALPHA,
                 sensitivity: tuple[float, ...] = (0.0, 0.1, 0.2, 0.4, 0.8)) -> dict[str, object]:
    """Impose artificial stockouts on fully in-stock days and score the recovery (plan §3.5).

    The headline uses the prior weight chosen on the SYNTHETIC validation window (`recover.DEFAULT_ALPHA`):
    nothing is tuned on the real data. A sweep over `sensitivity` on separate validation masks (days 31-60)
    shows the WAPE-bias trade-off. Profiles use days 1-60; the scored test masks are days 61-90.
    """
    n, d, _ = cube.sales.shape
    groups = group_codes(cube.keys)
    day = np.arange(d)
    fit = day < FIT_DAYS
    profiles = recover.estimate_profiles(cube.sales, cube.oos, groups, np.zeros(d, dtype=bool), fit)
    prof = np.broadcast_to(profiles["normal"][:, None, :], cube.sales.shape)
    rng = np.random.default_rng(seed)
    val_mask = _mask(cube, (day >= FIT_DAYS - 30) & fit, rng)
    sweep = {str(a): _score_mask(cube, prof, *val_mask, a) for a in sensitivity}
    test_mask = _mask(cube, ~fit, rng)
    truth_day = cube.sales.sum(axis=2)[test_mask[1], test_mask[2]]
    hidden = (cube.sales * test_mask[0]).sum(axis=2)[test_mask[1], test_mask[2]]
    return {"series_days_masked": int(test_mask[1].size),
            "masked_hours_share_of_day_sales": round(float(hidden.sum() / truth_day.sum()), 4),
            "alpha": alpha, "alpha_sensitivity_validation": sweep} | _score_mask(cube, prof, *test_mask, alpha) | {
            "first_hour_distribution": first_hour_distribution(cube.oos).round(4).tolist()}


# --- Forecast bias test ----------------------------------------------------------------------------------------

def _features(cube_daily: dict[str, np.ndarray], dates: pd.DatetimeIndex, t: np.ndarray, groups: np.ndarray,
              history: np.ndarray, level_floor: float) -> tuple[np.ndarray, np.ndarray]:
    """Features for day columns `t` of the combined (train + eval) timeline; lags read `history`.

    Returns (X, level): lag features are divided by the series level (mean of lags 7-34), so one global
    model serves series of very different sizes.
    """
    n = history.shape[0]
    rows_s = np.repeat(np.arange(n), t.size)
    rows_t = np.tile(t, n)
    window = np.stack([history[:, tt - 34:tt - 6] for tt in t], axis=1)            # (n, |t|, 28): lags 7..34
    level = np.maximum(window.mean(axis=2).ravel(), level_floor)
    lags = np.column_stack([history[rows_s, rows_t - lag] for lag in LAGS]) / level[:, None]
    rm7 = np.stack([history[:, tt - 13:tt - 6].mean(axis=1) for tt in t], axis=1).ravel() / level
    cov = np.column_stack([cube_daily[c][rows_s, rows_t] for c in
                           ("discount", "holiday_flag", "activity_flag", "precpt", "avg_temperature")])
    x = np.column_stack([lags, rm7, dates[rows_t].dayofweek, cov, groups[rows_s]]).astype(np.float32)
    return x, level


def forecast_bias_test(train: FrnCube, evaluation: FrnCube, seed: int,
                       alpha: float = recover.DEFAULT_ALPHA, max_rows: int = 1_000_000) -> dict[str, object]:
    """Train on raw vs recovered daily demand; score on the evaluation split's in-stock hours."""
    from sklearn.ensemble import HistGradientBoostingRegressor

    if not train.keys.equals(evaluation.keys):
        raise ValueError("train and eval splits must hold the same series in the same order")
    groups = group_codes(train.keys)
    d = train.sales.shape[1]
    no_special = np.zeros(d, dtype=bool)
    profiles = recover.estimate_profiles(train.sales, train.oos, groups, no_special, np.ones(d, dtype=bool))
    prof = np.broadcast_to(profiles["normal"][:, None, :], train.sales.shape)
    raw = train.sales.sum(axis=2).astype(float)
    recovered = _recover_in_chunks(train.sales, train.oos, prof, alpha).sum(axis=2).astype(float)

    dates = train.dates.append(evaluation.dates)
    cov = {k: np.concatenate([train.daily[k], evaluation.daily[k]], axis=1) for k in train.daily}
    in_stock = ~evaluation.oos
    s_in = (evaluation.sales * in_stock).sum(axis=2).astype(float)                  # (n, 7)
    m_in = (profiles["normal"][:, None, :] * in_stock).sum(axis=2)
    fully = ~evaluation.oos[:, :, TRADING_HOURS].any(axis=2)

    rng = np.random.default_rng(seed)
    results: dict[str, object] = {}
    for name, target in (("raw_sales", raw), ("recovered", recovered)):
        history = np.concatenate([target, np.zeros_like(raw[:, :evaluation.sales.shape[1]])], axis=1)
        train_t = np.arange(34, d)
        floor = 0.05 * float(target.mean())
        x, level = _features(cov, dates, train_t, groups, history, floor)
        y = target[:, train_t].ravel() / level
        pick = rng.choice(len(y), min(max_rows, len(y)), replace=False)
        model = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.06, max_leaf_nodes=63,
                                              min_samples_leaf=200, l2_regularization=1.0, random_state=seed,
                                              categorical_features=[x.shape[1] - 1])
        # Weighting the ratio loss by the level makes it a squared error in sales units ÷ level
        # (variance grows with volume), so the fit targets the mean, not the many tiny series.
        model.fit(x[pick], y[pick], sample_weight=level[pick])
        eval_t = np.arange(d, d + evaluation.sales.shape[1])
        xe, level_e = _features(cov, dates, eval_t, groups, history, floor)
        fc = np.maximum(model.predict(xe) * level_e, 0.0).reshape(s_in.shape)
        expected_in = fc * m_in
        results[name] = {
            "wpe_in_stock_hours": round(recover.wpe(expected_in, s_in), 4),
            "wape_in_stock_hours": round(recover.wape(expected_in, s_in), 4),
            "wpe_fully_in_stock_days": round(recover.wpe(fc[fully], evaluation.sales.sum(axis=2)[fully]), 4),
        }
    results["evaluation"] = (f"{len(evaluation.dates)}-day evaluation split ({evaluation.dates[0].date()} to "
                             f"{evaluation.dates[-1].date()}), scored on in-stock hours only")
    results["recovered_vs_raw_train_volume"] = round(float(recovered.sum() / raw.sum() - 1.0), 4)
    return results


# --- Artefact ---------------------------------------------------------------------------------------------------

PAPER = {"naiveWpe": -0.0737, "bestRecoveryWape": 0.2762, "sourceId": "wang2025-freshretailnet"}
LT_PERIOD = {"start": "2023-06-05", "end": "2025-07-13"}


def _entry(dataset_id: str, label: str, period: dict[str, str], section: dict, masking: dict[str, object]) -> dict:
    stock, cens = section["stockouts"], section["censoring"]
    return {"datasetId": dataset_id, "label": label, "period": period,
            "stockoutShareByHour": stock["stockout_share_by_hour_excl_all_day"],
            "oosHoursShare": stock["oos_hours_share"], "daysWithStockoutShare": stock["days_with_stockout_share"],
            "allDayOutageShare": stock["all_day_outage_share"],
            "censoring": {"morningSalesSoldOutLater": cens["morning_sales_sold_out_later"],
                          "morningSalesNoStockout": cens["morning_sales_no_stockout"], "ratio": cens["ratio"]},
            "masking": masking}


def realdata_body(calibration: dict, period: dict[str, str], mask: dict[str, object],
                  bias: dict[str, object]) -> dict[str, object]:
    """The realdata.json body (contract: web/src/lib/contracts/results.ts, RealDataFile).

    Stockout statistics come from calibration.json (measured by the Part 1 cleaning code on the full
    training splits); the masking and forecast-bias results come from this module.
    """
    method = (f"Profile recovery (alpha {mask['alpha']}, set on the synthetic world). Masking: "
              f"{mask['series_days_masked']:,} fully in-stock series-days (13 May-25 Jun 2024 window: days 61-90) "
              "masked from a first stockout hour drawn from the real distribution to midnight; recoveryWape/Wpe "
              "score the hidden demand per series-day. Forecast bias: the same gradient-boosted model trained on "
              "raw sales vs recovered demand, scored on in-stock hours of the 7-day evaluation split.")
    entries = [
        _entry("frn-50k", "FreshRetailNet-50K (training split)", period, calibration["frn50k"], {
            "method": method, "recoveryWape": mask["hidden_wape"], "recoveryWpe": mask["hidden_wpe"],
            "naiveForecastWpe": bias["raw_sales"]["wpe_in_stock_hours"],
            "recoveredForecastWpe": bias["recovered"]["wpe_in_stock_hours"]}),
        _entry("frn-lt", "FreshRetailNet-LT (training split)", LT_PERIOD, calibration["frnlt"], {
            "method": "Not run on FRN-LT: the plan's masking test uses FRN-50K.", "recoveryWape": None,
            "recoveryWpe": None, "naiveForecastWpe": None, "recoveredForecastWpe": None}),
    ]
    notes = [
        "Stockout shares by hour exclude all-day outages. Sales in FreshRetailNet are scaled, so only ratios and "
        "shares are reported.",
        f"Masking floor: even knowing each day's true total, splitting it by the intraday profile gives a hidden-"
        f"demand WAPE of {mask['oracle_hidden_wape']:.1%}; hour-level WAPE is {mask['hourly_wape']:.0%} because "
        "62% of in-stock trading hours sell nothing.",
        f"Forecast WAPE on in-stock hours: {bias['raw_sales']['wape_in_stock_hours']:.1%} (raw sales) vs "
        f"{bias['recovered']['wape_in_stock_hours']:.1%} (recovered). On fully in-stock days only, the raw-sales "
        f"bias is {bias['raw_sales']['wpe_fully_in_stock_days']:+.1%}: those days are quieter than average, so that "
        "view under-states the bias.",
        "The paper's figures (TFT on raw sales, WPE -7.37%; best masked-recovery WAPE 27.62%, TimesNet) use its own "
        "protocols and deep models; compare directions, not exact values.",
    ]
    return {"entries": entries, "paperReference": PAPER, "notes": notes}

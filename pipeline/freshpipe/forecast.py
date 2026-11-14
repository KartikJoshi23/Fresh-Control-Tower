"""Quantile demand forecasts and baselines (task P3-03, plan §3.6), plus the KQ2 ablation (P3-04, §3.8).

**Model.** Global scikit-learn `HistGradientBoostingRegressor` models with quantile loss: one per quantile
(P10, P50, P90) per horizon bucket (1-7, 8-14, 15-35 days), so nine models. Each bucket's lag features
are at least as long as the bucket's longest horizon, so one model covers every horizon in its bucket
(a "direct" multi-horizon forecast). Predicted quantiles are sorted so P10 ≤ P50 ≤ P90 always holds.

**Scale.** Series sell from 5 to 250 units a day, so the target and the lags enter as ratios to the
series level (the 28-day mean that ends `h_max` days before the target), with a floor, and every row
is weighted by its level so the loss is measured in units.

**Target.** Recovered demand (P3-01). The "naive" variant trains on recorded sales, to show the bias.

**Evaluation.** Against the KNOWN true demand of the synthetic world, on the 2026 test window
(Ramadan 2026, the stockpiling wave, Hormuz, summer). Models are fitted on train + validation data
(Jan 2023 - Dec 2025); hyperparameters are fixed, not searched.

**Baselines** (on recovered demand, at the same h_max lead): seasonal-naive (the same weekday h_max
days or more earlier), the legacy 28-day moving average, and additive Holt-Winters ETS with a weekly
season (statsmodels fits α and γ per series on the training window). The incumbent itself, the 28-day
average of RECORDED sales, is reported too.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .calendar_uae import Event
from .recover import wape, wpe
from .world import CATEGORIES, SKUS, STORES

QUANTILES = (0.1, 0.5, 0.9)
BUCKETS = ((1, 7), (8, 14), (15, 35))
LEVEL_FLOOR = 0.5               # units/day: stops near-empty windows producing huge ratios
CLIP_DAYS = 60                  # moving-holiday distances are clipped to ±60 days

#: Feature groups for the ablation (plan §3.8). "history" (lags, rolling means, series identity) is always kept.
FEATURE_GROUPS = {
    "history": ("lag_a", "lag_b", "lag_c", "lag_d", "lag_364", "roll7", "roll28_level", "store", "sku", "category"),
    "calendar": ("weekday", "day_of_year", "days_from_ramadan", "ramadan_day", "days_from_eid_fitr",
                 "days_from_eid_adha", "days_from_national_day", "event", "public_holiday", "summer_break"),
    "promotions": ("promo_depth", "price"),
    "weather": ("t_mean", "precip"),
}
CATEGORICAL = ("store", "sku", "category", "event")
HGB_PARAMS = dict(max_iter=400, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=100, l2_regularization=1.0)


# --- Calendar features ------------------------------------------------------------------------------------------

def days_from(dates: pd.DatetimeIndex, starts: list, clip: int = CLIP_DAYS) -> np.ndarray:
    """Signed days from the nearest event start (negative = before it), clipped to ±clip."""
    if not starts:
        return np.full(len(dates), float(clip))
    s = pd.DatetimeIndex(sorted(pd.Timestamp(x) for x in starts))
    diff = (dates.values[:, None] - s.values[None, :]) / np.timedelta64(1, "D")
    nearest = diff[np.arange(len(dates)), np.abs(diff).argmin(axis=1)]
    return np.clip(nearest, -clip, clip)


def calendar_features(dates: pd.DatetimeIndex, events: list[Event], labels: pd.DataFrame) -> dict[str, np.ndarray]:
    """(d,) calendar features known in advance: weekday, moving holidays (lunar shift), holidays, summer."""
    starts = {fam: [e.start for e in events if e.family == fam] for fam in
              ("ramadan", "eid-al-fitr", "eid-al-adha", "national-day")}
    event_codes = {e: i for i, e in enumerate(sorted(labels["event"].unique()))}
    return {
        "weekday": dates.dayofweek.to_numpy(float),
        "day_of_year": dates.dayofyear.to_numpy(float),
        "days_from_ramadan": days_from(dates, starts["ramadan"]),
        "ramadan_day": labels["ramadan_day"].to_numpy(float),
        "days_from_eid_fitr": days_from(dates, starts["eid-al-fitr"]),
        "days_from_eid_adha": days_from(dates, starts["eid-al-adha"]),
        "days_from_national_day": days_from(dates, starts["national-day"]),
        "event": labels["event"].map(event_codes).to_numpy(float),
        "public_holiday": labels["public_holiday"].to_numpy(float),
        "summer_break": labels["summer_break"].to_numpy(float),
    }


def weather_features(dates: pd.DatetimeIndex, weather: pd.DataFrame, series_store: np.ndarray) -> dict[str, np.ndarray]:
    """(n, d) REAL daily mean temperature and rain of each series' emirate (used for the 1-7 day bucket only)."""
    frame = weather.assign(date=pd.to_datetime(weather["date"]))
    emirates = [s.emirate for s in STORES]
    out = {}
    for col, name in (("tMeanC", "t_mean"), ("precipMm", "precip")):
        table = frame.pivot(index="date", columns="emirate", values=col).reindex(dates)
        out[name] = np.stack([table[emirates[s]].to_numpy(float) for s in series_store])
    return out


# --- Feature matrix -----------------------------------------------------------------------------------------------

@dataclass
class Inputs:
    """Everything the forecaster sees, as (n, d) or (d,) arrays over the horizon."""

    dates: pd.DatetimeIndex
    calendar: dict[str, np.ndarray]
    weather: dict[str, np.ndarray]
    promo: np.ndarray
    series_store: np.ndarray
    series_sku: np.ndarray
    extra: dict[str, object] = field(default_factory=dict)

    @property
    def n(self) -> int:
        return self.promo.shape[0]


def _rolling_mean(y: np.ndarray, window: int, lag: int) -> np.ndarray:
    """(n, d) mean of y over days [t - lag - window + 1, t - lag]; NaN where incomplete."""
    n, d = y.shape
    c = np.concatenate([np.zeros((n, 1)), np.cumsum(y, axis=1)], axis=1)
    out = np.full((n, d), np.nan)
    t = np.arange(d)
    hi, lo = t - lag + 1, t - lag - window + 1
    ok = lo >= 0
    out[:, ok] = (c[:, hi[ok]] - c[:, lo[ok]]) / window
    return out


def _lag(y: np.ndarray, k: int) -> np.ndarray:
    out = np.full(y.shape, np.nan)
    out[:, k:] = y[:, :-k]
    return out


def feature_names(bucket: int, groups: tuple[str, ...]) -> list[str]:
    names = [f for g in groups for f in FEATURE_GROUPS[g]]
    return names if bucket == 0 else [f for f in names if f not in FEATURE_GROUPS["weather"]]


def build_matrix(y: np.ndarray, inp: Inputs, bucket: int, groups: tuple[str, ...]) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """(X, level, names) for every series-day. Rows are series-major; X has NaN where lags are missing.

    Lags are multiples of 7 at or beyond the bucket's longest horizon, so they keep the weekday.
    Weather enters the 1-7 day bucket only (a one-week weather forecast is close to the actual).
    """
    h_max = BUCKETS[bucket][1]
    first = int(np.ceil(h_max / 7) * 7)
    level = np.maximum(_rolling_mean(y, 28, h_max), LEVEL_FLOOR)
    cols: dict[str, np.ndarray] = {}
    for i, name in enumerate(("lag_a", "lag_b", "lag_c", "lag_d")):
        cols[name] = _lag(y, first + 7 * i) / level
    cols["lag_364"] = _lag(y, 364) / level
    cols["roll7"] = _rolling_mean(y, 7, h_max) / level
    cols["roll28_level"] = np.log(level)
    n, d = y.shape
    cols["store"] = np.broadcast_to(inp.series_store[:, None], (n, d)).astype(float)
    cols["sku"] = np.broadcast_to(inp.series_sku[:, None], (n, d)).astype(float)
    cat_of = np.array([[c.id for c in CATEGORIES].index(s.category_id) for s in SKUS])
    cols["category"] = np.broadcast_to(cat_of[inp.series_sku][:, None], (n, d)).astype(float)
    for k, v in inp.calendar.items():
        cols[k] = np.broadcast_to(v[None, :], (n, d))
    cols["promo_depth"] = inp.promo
    cols["price"] = np.broadcast_to(np.array([s.price_aed for s in SKUS])[inp.series_sku][:, None], (n, d))
    cols.update(inp.weather)
    names = feature_names(bucket, groups)
    x = np.stack([cols[nm].reshape(-1) for nm in names], axis=1).astype(np.float32)
    return x, level.reshape(-1), names


def _model(quantile: float, names: list[str], seed: int):
    from sklearn.ensemble import HistGradientBoostingRegressor

    return HistGradientBoostingRegressor(loss="quantile", quantile=quantile, random_state=seed,
                                         categorical_features=[names.index(c) for c in CATEGORICAL if c in names],
                                         **HGB_PARAMS)


def fit_predict(y: np.ndarray, inp: Inputs, train_days: np.ndarray, *, bucket: int = 0,
                quantiles: tuple[float, ...] = QUANTILES, groups: tuple[str, ...] = tuple(FEATURE_GROUPS),
                seed: int = 2026) -> np.ndarray:
    """Fit one bucket's quantile models on `train_days` and predict every day. Returns (q, n, d), sorted."""
    x, level, names = build_matrix(y, inp, bucket, groups)
    n, d = y.shape
    usable = ~np.isnan(x[:, names.index("lag_d")])
    rows = usable & np.repeat(train_days[None, :], n, axis=0).reshape(-1)
    target = (y.reshape(-1) / level)[rows]
    out = np.full((len(quantiles), n * d), np.nan)
    for i, q in enumerate(quantiles):
        model = _model(q, names, seed)
        model.fit(x[rows], target, sample_weight=level[rows])
        out[i, usable] = np.maximum(model.predict(x[usable]), 0.0) * level[usable]
    out = np.sort(out, axis=0)                     # no crossing quantiles
    return out.reshape(len(quantiles), n, d)


# --- Baselines ----------------------------------------------------------------------------------------------------

def seasonal_naive(y: np.ndarray, bucket: int) -> np.ndarray:
    """Same weekday, at least h_max days earlier."""
    return _lag(y, int(np.ceil(BUCKETS[bucket][1] / 7) * 7))


def moving_average(y: np.ndarray, bucket: int, window: int = 28) -> np.ndarray:
    """The legacy 28-day moving average, ending h_max days before the target."""
    return _rolling_mean(y, window, BUCKETS[bucket][1])


def ets_forecast(y: np.ndarray, fit_days: np.ndarray, bucket: int) -> tuple[np.ndarray, dict]:
    """Additive Holt-Winters (weekly season, no trend), h_max days ahead, from every origin.

    statsmodels estimates α (level) and γ (season) and the initial states per series on `fit_days`;
    the recursion then runs over the whole horizon with those fixed parameters:
        ℓ_t = α (y_t − s_{t−7}) + (1 − α) ℓ_{t−1},   s_t = γ (y_t − ℓ_{t−1}) + (1 − γ) s_{t−7},
    and the forecast for t made at t − h is ℓ_{t−h} + s_{t−h + h − 7⌈h/7⌉}.
    """
    import warnings

    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    n, d = y.shape
    alpha, gamma = np.zeros(n), np.zeros(n)
    level0, season0 = np.zeros(n), np.zeros((n, 7))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for i in range(n):
            fit = ExponentialSmoothing(y[i, fit_days], trend=None, seasonal="add", seasonal_periods=7,
                                       initialization_method="estimated").fit()
            alpha[i], gamma[i] = fit.params["smoothing_level"], fit.params["smoothing_seasonal"]
            level0[i], season0[i] = fit.params["initial_level"], fit.params["initial_seasons"]
    level = np.zeros((n, d))
    season = np.zeros((n, d + 7))
    season[:, :7] = season0                      # season[:, t + 7] is s_t
    prev = level0
    for t in range(d):
        s_old = season[:, t]
        level[:, t] = alpha * (y[:, t] - s_old) + (1 - alpha) * prev
        season[:, t + 7] = gamma * (y[:, t] - prev) + (1 - gamma) * s_old
        prev = level[:, t]
    h = BUCKETS[bucket][1]
    back = 7 * int(np.ceil(h / 7))
    out = np.full((n, d), np.nan)
    t = np.arange(h, d)
    out[:, t] = level[:, t - h] + season[:, t - back + 7]
    params = {"alpha_median": round(float(np.median(alpha)), 4), "gamma_median": round(float(np.median(gamma)), 4)}
    return np.maximum(out, 0.0), params


# --- Metrics --------------------------------------------------------------------------------------------------------

def pinball(pred: np.ndarray, truth: np.ndarray, q: float) -> float:
    """Mean quantile loss, scaled by mean truth (so it reads like a WAPE)."""
    diff = truth - pred
    return float(np.mean(np.maximum(q * diff, (q - 1) * diff)) / np.mean(truth))


def score(fc: np.ndarray, truth: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    """WAPE and bias of a point forecast (or P50) over masked series-days."""
    ok = mask & ~np.isnan(fc)
    return {"wape": round(wape(fc[ok], truth[ok]), 4), "wpe": round(wpe(fc[ok], truth[ok]), 4)}


def score_quantiles(q: np.ndarray, truth: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    ok = mask & ~np.isnan(q).any(axis=0)
    out = score(q[1], truth, ok)
    out["coverage_p10_p90"] = round(float(((truth >= q[0]) & (truth <= q[2]))[ok].mean()), 4)
    out.update({f"pinball_p{int(qq * 100)}": round(pinball(q[i][ok], truth[ok], qq), 4)
                for i, qq in enumerate(QUANTILES)})
    return out


# --- The synthetic world --------------------------------------------------------------------------------------------

def world_forecast_inputs(world, config: dict) -> Inputs:
    """Forecast inputs over the horizon of a generated world (calendar, REAL weather, announced promotions)."""
    from .calendar_uae import load_events
    from .generate import series_index
    from .weather import load_weather

    h = world.horizon
    dates = world.dates[h]
    labels = world.day_labels.iloc[world.n_warmup:].reset_index(drop=True)
    stores, skus = series_index()
    return Inputs(dates, calendar_features(dates, load_events(), labels), weather_features(dates, load_weather(), stores),
                  world.promo_by_series[:, h].astype(float), stores, skus)


def stress_windows(config: dict, events: list[Event]) -> dict[str, tuple[str, str]]:
    """Test-window slices reported separately (plan §3.6): Ramadan 2026, the stockpiling wave, Hormuz, summer."""
    ramadan = next(e for e in events if e.family == "ramadan" and e.start.year == 2026)
    wave = config["world"]["stockpiling_2026"]
    wave_end = pd.Timestamp(wave["start"]) + pd.Timedelta(days=len(wave["shape"]) - 1)
    return {"ramadan_2026": (str(ramadan.start), str(ramadan.end)),
            "stockpiling_2026": (wave["start"], str(wave_end.date())),
            "hormuz_2026": (config["world"]["hormuz_2026"]["start"], config["world"]["hormuz_2026"]["end"]),
            "summer_2026": ("2026-07-01", "2026-08-31"),
            "normal_2026": ("2026-01-05", "2026-02-10")}


@dataclass
class ForecastRun:
    quantiles: np.ndarray            # (buckets, q, n, d) on recovered demand
    naive_quantiles: np.ndarray      # (q, n, d) bucket 1-7, trained on recorded sales
    report: dict[str, object]


def forecast_world(world, recovered: np.ndarray, recorded: np.ndarray, config: dict, seed: int | None = None) -> ForecastRun:
    """Fit the nine quantile models (plus the naive variant) and score them and the baselines on 2026."""
    from .calendar_uae import load_events

    seed = int(config["seed"] if seed is None else seed)
    inp = world_forecast_inputs(world, config)
    truth = world.demand[:, world.horizon].astype(float)
    dates = inp.dates
    train = np.asarray(dates <= pd.Timestamp(config["splits"]["validation_end"]))
    fit_window = np.asarray(dates <= pd.Timestamp(config["splits"]["train_end"]))
    test = np.repeat(np.asarray(dates >= pd.Timestamp(config["splits"]["test_start"]))[None, :], inp.n, axis=0)

    quantiles = np.stack([fit_predict(recovered, inp, train, bucket=b, seed=seed) for b in range(len(BUCKETS))])
    naive = fit_predict(recorded, inp, train, bucket=0, seed=seed)

    report: dict[str, object] = {"model": "HistGradientBoostingRegressor(quantile)", "hyperparameters": HGB_PARAMS,
                                 "fitted_on": f"{dates[0].date()} to {config['splits']['validation_end']}",
                                 "test": f"{config['splits']['test_start']} to {dates[-1].date()}",
                                 "evaluated_against": "true demand (synthetic ground truth)", "buckets": {}}
    for b, (lo, hi) in enumerate(BUCKETS):
        ets, ets_params = ets_forecast(recovered, fit_window, b)
        report["buckets"][f"{lo}-{hi}"] = {
            "ai_recovered": score_quantiles(quantiles[b], truth, test),
            "seasonal_naive": score(seasonal_naive(recovered, b), truth, test),
            "moving_average_28d": score(moving_average(recovered, b), truth, test),
            "ets": score(ets, truth, test) | {"params": ets_params},
        }
    first = report["buckets"]["1-7"]
    first["ai_trained_on_recorded_sales"] = score_quantiles(naive, truth, test)
    first["legacy_ma28_on_recorded_sales"] = score(moving_average(recorded, 0), truth, test)

    cat_of = np.array([[c.id for c in CATEGORIES].index(s.category_id) for s in SKUS])[inp.series_sku]
    report["by_category_1_7"] = {c.id: score_quantiles(quantiles[0], truth, test & (cat_of == i)[:, None])
                                 for i, c in enumerate(CATEGORIES)}
    report["by_window_1_7"] = {}
    for name, (start, end) in stress_windows(config, load_events()).items():
        w = np.repeat(np.asarray((dates >= pd.Timestamp(start)) & (dates <= pd.Timestamp(end)))[None, :], inp.n, axis=0)
        report["by_window_1_7"][name] = {"range": [start, end], "ai_recovered": score_quantiles(quantiles[0], truth, w),
                                         "ai_trained_on_recorded_sales": score(naive[1], truth, w),
                                         "seasonal_naive": score(seasonal_naive(recovered, 0), truth, w)}
    return ForecastRun(quantiles.astype(np.float32), naive.astype(np.float32), report)


def ablation(world, recovered: np.ndarray, recorded: np.ndarray, config: dict, seed: int | None = None) -> dict[str, object]:
    """KQ2: retrain the 1-7 day P50 model without each feature group and score it on 2026 (plan §3.8)."""
    seed = int(config["seed"] if seed is None else seed)
    inp = world_forecast_inputs(world, config)
    truth = world.demand[:, world.horizon].astype(float)
    train = np.asarray(inp.dates <= pd.Timestamp(config["splits"]["validation_end"]))
    test = np.repeat(np.asarray(inp.dates >= pd.Timestamp(config["splits"]["test_start"]))[None, :], inp.n, axis=0)
    all_groups = tuple(FEATURE_GROUPS)

    def p50(y: np.ndarray, groups: tuple[str, ...]) -> dict[str, float]:
        return score(fit_predict(y, inp, train, bucket=0, quantiles=(0.5,), groups=groups, seed=seed)[0], truth, test)

    full = p50(recovered, all_groups)
    variants = [
        ("history-only", "Sales history only", "Lags, rolling means and series identity; no calendar, promotions or weather.",
         p50(recovered, ("history",))),
        ("stock-status", "Stock status (demand recovery)",
         "Trained on recorded sales instead of recovered demand: the model cannot tell an empty shelf from no demand.",
         p50(recorded, all_groups)),
        ("calendar", "Calendar and festivals", "Without weekday, Ramadan and Eid timing, holidays and the summer break.",
         p50(recovered, tuple(g for g in all_groups if g != "calendar"))),
        ("promotions", "Promotions and price", "Without the announced promotion depth and the shelf price.",
         p50(recovered, tuple(g for g in all_groups if g != "promotions"))),
        ("weather", "Weather", "Without the real UAE daily temperature and rain.",
         p50(recovered, tuple(g for g in all_groups if g != "weather"))),
    ]
    groups = [{"id": i, "label": label, "description": desc, "wape": v["wape"], "wpe": v["wpe"],
               "deltaWape": round(v["wape"] - full["wape"], 4), "deltaWpe": round(v["wpe"] - full["wpe"], 4)}
              for i, label, desc, v in variants]
    return {"evaluation": ("1-7 day P50 forecast, Jan-Oct 2026 test window, scored against the known true demand of "
                           "the synthetic world. Each row drops one feature group (or, for stock status, trains on "
                           "recorded sales) and shows the change against the full model. Supplier lead time is an "
                           "input to the ordering decision, not to the demand forecast, so it is not ablated here."),
            "full": full, "groups": groups}

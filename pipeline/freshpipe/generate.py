"""Synthetic UAE world: true daily and hourly demand for 8 stores × 40 SKUs (task P2-01, plan §3.4).

Daily true demand is negative binomial with mean

    λ(s,k,t) = base(k) × size(s) × affinity(s,k) × weekly(t) × festival(c,t) × weather(e,t)
               × promotion(k,t) × stockpiling(c,t) × store shock(s,t) × spikes(s,k,t)

where c is the SKU's category and e the store's emirate. Hourly demand splits the day with the
calibrated intraday profile (the Ramadan profile during Ramadan) plus Dirichlet noise.

Where each component comes from:
- weekly index, intraday profiles, promotion and weather coefficients, festival SHAPES: REAL
  (data/processed/calibration.json);
- weather: REAL UAE daily weather (Open-Meteo), applied as deviations from the 2023-26 seasonal norm;
- festival dates: REAL (data/external/uae_calendar.csv);
- the Ramadan-season amplitude and the 2026 stockpiling wave: ANCHORED to cited Gulf figures by solving
  for the amplitude (`solve_ramadan_amplitude`, `solve_stockpiling_amplitude`);
- everything else: ASSUMPTION or TUNED values in pipeline/config.yaml and freshpipe/world.py.

The world is reproducible: every random draw comes from a named stream of the config seed.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from . import __version__
from .calendar_uae import Event, load_events
from .config import load_config, repo_path
from .weather import load_weather
from .world import CATEGORIES, SKUS, STORES, rng_for, validate_world

HOURS = 24
#: Weather effects are applied to deviations from the seasonal norm, clipped to these limits (ASSUMPTION:
#: keeps the FreshRetailNet coefficients inside the range they were estimated on).
TEMP_ANOMALY_LIMIT_C = 6.0
RAIN_CAP_MM = 20.0

EVENT_NONE, EVENT_ITEM_SPIKE, EVENT_STORE_SURGE, EVENT_STOCKPILING = 0, 1, 2, 3
EVENT_KINDS = {EVENT_NONE: "none", EVENT_ITEM_SPIKE: "item_spike", EVENT_STORE_SURGE: "store_surge",
               EVENT_STOCKPILING: "stockpiling"}


@dataclass
class World:
    """The generated world. Arrays are indexed [series, day(, hour)]; series are store-major."""

    seed: int
    dates: pd.DatetimeIndex                 # warm-up days, then the horizon
    n_warmup: int
    expected: np.ndarray                    # (n, d) mean demand from the deterministic components
    multiplier: np.ndarray                  # (n, d) store shocks, store surges and item spikes
    demand_h: np.ndarray                    # (n, d, 24) true hourly demand (units)
    promo_depth: np.ndarray                 # (k, d) chain-wide promotion depth (0 = none)
    event_kind: np.ndarray                  # (n, d) EVENT_* code of the strongest unannounced event
    day_labels: pd.DataFrame                # one row per day: calendar event labels
    series_sku: np.ndarray                  # (n,) SKU index of each series (row of promo_depth)
    params: dict[str, object] = field(default_factory=dict)

    @property
    def promo_by_series(self) -> np.ndarray:
        """(n, d) announced promotion depth of each series."""
        return self.promo_depth[self.series_sku]

    @property
    def n_series(self) -> int:
        return self.demand_h.shape[0]

    @property
    def demand(self) -> np.ndarray:
        """(n, d) true daily demand."""
        return self.demand_h.sum(axis=2)

    @property
    def horizon(self) -> slice:
        """Day slice of the horizon (warm-up days excluded)."""
        return slice(self.n_warmup, len(self.dates))


def series_index() -> tuple[np.ndarray, np.ndarray]:
    """Store index and SKU index of each series (store-major order)."""
    stores = np.repeat(np.arange(len(STORES)), len(SKUS))
    skus = np.tile(np.arange(len(SKUS)), len(STORES))
    return stores, skus


def series_ids() -> list[str]:
    """'store__sku' id of each series, in series order."""
    return [f"{STORES[s].id}__{SKUS[k].id}" for s, k in zip(*series_index())]


def day_range(config: dict) -> tuple[pd.DatetimeIndex, int]:
    """All simulated days (warm-up plus horizon) and the number of warm-up days."""
    warmup = int(config["world"]["warmup_days"])
    start = pd.Timestamp(config["horizon"]["start"]) - pd.Timedelta(days=warmup)
    return pd.date_range(start, config["horizon"]["end"], freq="D"), warmup


# --- Deterministic components -------------------------------------------------------------------------------

def weekly_index(dates: pd.DatetimeIndex, calibration: dict) -> np.ndarray:
    """UAE weekly index (Saturday-Sunday weekend) from calibration.json, per day."""
    index = np.asarray(calibration["uae"]["weekly"]["index_mon_to_sun"], dtype=float)
    return index[dates.dayofweek]


def pre_ramp(calibration: dict) -> np.ndarray:
    """Festival build-up shape for the 14 days before an event (index 0 = day -14), peak 1 on the eve.

    REAL shape: the Kaggle store's Lunar New Year pre-festival curve. Its eve (day -1) is a closure, so
    the curve is shifted one day later: the real day -2 peak lands on the eve. Uplifts below 0 become 0.
    """
    shape = calibration["veg"]["lunar_new_year_shape"]
    index = dict(zip(shape["offsets"], shape["mean_index"]))
    uplift = np.array([max((index.get(o - 1) or 1.0) - 1.0, 0.0) for o in range(-14, 0)])
    return uplift / uplift[-1]


def holiday_dip(calibration: dict, scale: float) -> np.ndarray:
    """Multipliers for days 0-6 of an Eid holiday.

    REAL shape: FreshRetailNet-LT dark-store demand around Spring Festival, when city residents travel.
    `scale` (ASSUMPTION) sets how much of that dip applies to the UAE Eid holidays.
    """
    shape = calibration["frnlt"]["spring_festival_shape"]
    index = dict(zip(shape["offsets"], shape["mean_index"]))
    return np.array([1.0 - scale * (1.0 - index[o]) for o in range(7)])


@dataclass(frozen=True)
class FestivalParts:
    """Festival multipliers split so the Ramadan amplitude can be solved without recomputing the rest."""

    ramadan_unit: np.ndarray   # (c, d) Ramadan-linked uplift per unit of amplitude (additive inside 1 + A × ...)
    fixed: np.ndarray          # (c, d) all multipliers that do not depend on the Ramadan amplitude
    labels: pd.DataFrame

    def multiplier(self, amplitude: float) -> np.ndarray:
        return self.fixed * (1.0 + amplitude * self.ramadan_unit)


def festival_parts(dates: pd.DatetimeIndex, events: list[Event], calibration: dict, params: dict) -> FestivalParts:
    """Festival, public-holiday and summer multipliers per category and day (plan §3.3-3.4).

    Ramadan-linked effects (the build-up to Ramadan, Ramadan itself and the build-up to Eid al-Fitr) scale
    with one amplitude, solved later against the NielsenIQ anchor. The rest are fixed:
    - the Eid holiday dip (REAL shape, ASSUMPTION scale), on every category;
    - the build-up to Eid al-Adha (scales with the same amplitude through `eid_adha_pre_share`);
    - National Day eve, public holidays (REAL FreshRetailNet effect) and the summer dip (ASSUMPTION).
    """
    n_days = len(dates)
    day_of = {d.date(): i for i, d in enumerate(dates)}
    ramp = pre_ramp(calibration)
    dip = holiday_dip(calibration, params["eid_dip_scale"])
    w_ramadan = np.array([c.ramadan_weight for c in CATEGORIES])[:, None]
    w_adha = np.array([c.adha_weight for c in CATEGORIES])[:, None]
    ramadan_unit = np.zeros((len(CATEGORIES), n_days))
    fixed = np.ones((len(CATEGORIES), n_days))
    label = np.array([""] * n_days, dtype=object)
    ramadan_day = np.zeros(n_days, dtype=int)
    public_holiday = np.zeros(n_days, dtype=bool)

    def days(start: date, offsets: range) -> list[tuple[int, int]]:
        """(day index, offset) for start + offset that falls inside the simulated range."""
        out = []
        for o in offsets:
            i = day_of.get(start + timedelta(days=o))
            if i is not None:
                out.append((i, o))
        return out

    by_family: dict[str, list[Event]] = {}
    for event in events:
        by_family.setdefault(event.family, []).append(event)
        if event.public_holiday:
            for i, _ in days(event.start, range((event.end - event.start).days + 1)):
                public_holiday[i] = True

    eid_fitr_starts = {e.start.year: e.start for e in by_family.get("eid-al-fitr", [])}
    for event in by_family.get("ramadan", []):
        for i, o in days(event.start, range(-14, 0)):
            ramadan_unit[:, i] += w_ramadan[:, 0] * ramp[o + 14]
            label[i] = "ramadan-pre"
        eid = eid_fitr_starts.get(event.start.year)
        last = (min(event.end, eid - timedelta(days=1)) if eid else event.end)
        for i, o in days(event.start, range((last - event.start).days + 1)):
            ramadan_unit[:, i] += w_ramadan[:, 0] * params["ramadan_during_share"]
            label[i] = "ramadan"
        for i, o in days(event.start, range((event.end - event.start).days + 1)):
            ramadan_day[i] = o + 1
    for event in by_family.get("eid-al-fitr", []):
        for i, o in days(event.start, range(-3, 0)):
            ramadan_unit[:, i] += w_ramadan[:, 0] * params["eid_fitr_pre_share"] * ramp[o + 14]
            label[i] = "eid-al-fitr-pre"
        for i, o in days(event.start, range(7)):
            fixed[:, i] *= dip[o]
            label[i] = "eid-al-fitr"
    for event in by_family.get("eid-al-adha", []):
        for i, o in days(event.start, range(-3, 0)):
            # Scales with the Ramadan amplitude too: stored as a ratio and resolved in `multiplier`.
            ramadan_unit[:, i] += w_adha[:, 0] * params["eid_adha_pre_share"] * ramp[o + 14]
            label[i] = "eid-al-adha-pre"
        for i, o in days(event.start, range(7)):
            fixed[:, i] *= dip[o]
            label[i] = "eid-al-adha"
    for event in by_family.get("national-day", []):
        for i, o in days(event.start, range(-2, 0)):
            fixed[:, i] *= 1.0 + params["national_day_peak"] * ramp[o + 14]
            if not label[i]:
                label[i] = "national-day-pre"
    summer = np.zeros(n_days, dtype=bool)
    for event in by_family.get("summer-break", []):
        length = (event.end - event.start).days + 1
        for i, o in days(event.start, range(length)):
            ramp_in = min(1.0, (o + 1) / 14.0)          # residents leave over the first two weeks
            ramp_out = min(1.0, (length - o) / 7.0)      # and return over the last week
            fixed[:, i] *= 1.0 - params["summer_dip"] * min(ramp_in, ramp_out)
            summer[i] = True
            if not label[i]:
                label[i] = "summer-break"

    fixed *= np.where(public_holiday, params["public_holiday_multiplier"], 1.0)[None, :]
    labels = pd.DataFrame({"date": dates, "event": label, "ramadan_day": ramadan_day,
                           "public_holiday": public_holiday, "summer_break": summer})
    return FestivalParts(ramadan_unit, fixed, labels)


def weather_multiplier(dates: pd.DatetimeIndex, calibration: dict, weather: pd.DataFrame | None = None) -> np.ndarray:
    """(emirate, day) demand multiplier from REAL UAE weather and the REAL FreshRetailNet-LT coefficients.

    Temperature enters as the deviation from the 2023-26 seasonal norm for that emirate and day of year
    (a 31-day centred mean), so the coefficient captures heat waves, not the whole seasonal cycle
    (ASSUMPTION). Days without weather data (the warm-up) get 1.
    """
    weather = weather if weather is not None else load_weather()
    multipliers = calibration["frnlt"]["effects_log_sales"]["multipliers"]
    per_degree, per_10mm = multipliers["per_degree_c"], multipliers["per_10mm_precipitation"]
    emirates = sorted({s.emirate for s in STORES})
    out = np.ones((len(emirates), len(dates)))
    frame = weather.assign(date=pd.to_datetime(weather["date"]))
    for e, emirate in enumerate(emirates):
        rows = frame.loc[frame["emirate"] == emirate].set_index("date").sort_index()
        doy = np.minimum(rows.index.dayofyear, 365)  # 31 Dec of a leap year shares day 365
        norm = rows["tMeanC"].groupby(doy).mean().reindex(range(1, 366)).interpolate(limit_direction="both")
        smooth = pd.Series(np.convolve(np.r_[norm.values[-15:], norm.values, norm.values[:15]],
                                       np.ones(31) / 31, mode="valid"), index=norm.index)
        anomaly = (rows["tMeanC"] - smooth.reindex(doy).values).clip(-TEMP_ANOMALY_LIMIT_C, TEMP_ANOMALY_LIMIT_C)
        rain = rows["precipMm"].clip(upper=RAIN_CAP_MM)
        effect = per_degree ** anomaly * per_10mm ** (rain / 10.0)
        aligned = effect.reindex(dates)
        out[e] = aligned.fillna(1.0).to_numpy()
    return out


def emirate_of_store() -> np.ndarray:
    emirates = sorted({s.emirate for s in STORES})
    return np.array([emirates.index(s.emirate) for s in STORES])


def promotions(dates: pd.DatetimeIndex, params: dict, seed: int) -> np.ndarray:
    """(SKU, day) chain-wide promotion depth (0 = none). Episodes and depths are ASSUMPTIONS."""
    rng = rng_for(seed, "promotions")
    depth = np.zeros((len(SKUS), len(dates)))
    mean_gap = 365.0 / params["episodes_per_year"]
    for k in range(len(SKUS)):
        day = int(rng.integers(0, int(mean_gap)))
        while day < len(dates):
            length = int(rng.integers(params["min_days"], params["max_days"] + 1))
            depth[k, day:day + length] = rng.choice(params["depths"])
            day += length + int(rng.geometric(1.0 / max(mean_gap - length, 1.0)))
    return depth


def promo_multiplier(depth: np.ndarray, calibration: dict) -> np.ndarray:
    """REAL FreshRetailNet-LT promotion response: per 10 points of discount, plus the activity-day effect."""
    m = calibration["frnlt"]["effects_log_sales"]["multipliers"]
    return np.where(depth > 0, m["per_10pct_discount"] ** (depth / 0.10) * m["activity_day"], 1.0)


def stockpiling_unit(dates: pd.DatetimeIndex, params: dict) -> np.ndarray:
    """(category, day) stockpiling wave per unit of amplitude; the shape and weights are ASSUMPTIONS."""
    out = np.zeros((len(CATEGORIES), len(dates)))
    start = pd.Timestamp(params["start"])
    weights = np.array([c.stockpile_weight for c in CATEGORIES])
    for o, value in enumerate(params["shape"]):
        hits = np.flatnonzero(dates == start + pd.Timedelta(days=o))
        if hits.size:
            out[:, hits[0]] = weights * value
    return out


# --- Anchors ---------------------------------------------------------------------------------------------------

def _bisect(f, lo: float, hi: float, target: float, tol: float = 1e-6) -> float:
    """Solve f(x) = target for increasing f on [lo, hi]."""
    if f(lo) >= target:
        return lo
    if f(hi) < target:
        raise ValueError(f"target {target} unreachable within [{lo}, {hi}]")
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if f(mid) < target else (lo, mid)
        if hi - lo < tol:
            break
    return 0.5 * (lo + hi)


def ramadan_season_share(store_total: np.ndarray, dates: pd.DatetimeIndex, events: list[Event],
                         params: dict, years: tuple[int, ...]) -> float:
    """Mean share of each full year's demand that falls in its Ramadan season (the anchor's interpretation)."""
    starts = {e.start.year: pd.Timestamp(e.start) for e in events if e.family == "ramadan"}
    shares = []
    for year in years:
        in_year = dates.year == year
        first = starts[year] - pd.Timedelta(days=params["ramadan_season_days_before"])
        season = (dates >= first) & (dates < first + pd.Timedelta(days=params["ramadan_season_days"]))
        shares.append(store_total[season & in_year].sum() / store_total[in_year].sum())
    return float(np.mean(shares))


def ramadan_mean_daily(store_total: np.ndarray, dates: pd.DatetimeIndex, events: list[Event], year: int) -> float:
    """Mean daily demand over Ramadan of `year`."""
    event = next(e for e in events if e.family == "ramadan" and e.start.year == year)
    mask = (dates >= pd.Timestamp(event.start)) & (dates <= pd.Timestamp(event.end))
    return float(store_total[mask].mean())


# --- Generation -----------------------------------------------------------------------------------------------

def base_demand(seed: int, affinity_sd: float) -> np.ndarray:
    """(n,) base demand: SKU base × store size × store-SKU affinity (mean-one log-normal, ASSUMPTION)."""
    stores, skus = series_index()
    rng = rng_for(seed, "affinity")
    affinity = np.exp(rng.normal(-0.5 * affinity_sd ** 2, affinity_sd, size=stores.size))
    size = np.array([s.size_index for s in STORES])[stores]
    base = np.array([k.base_daily for k in SKUS])[skus]
    return base * size * affinity


def generate_world(config: dict | None = None, calibration: dict | None = None, seed: int | None = None,
                   weather: pd.DataFrame | None = None, events: list[Event] | None = None) -> World:
    """Generate the full world. Pure function of (config, calibration, seed, weather, events)."""
    config = config or load_config()
    calibration = calibration or json.loads((repo_path("processed") / "calibration.json").read_text(encoding="utf-8"))
    seed = int(config["seed"] if seed is None else seed)
    events = events if events is not None else load_events()
    validate_world(config["world"])
    wcfg = config["world"]
    dates, n_warmup = day_range(config)
    n_days = len(dates)
    stores, skus = series_index()
    categories = np.array([[c.id for c in CATEGORIES].index(SKUS[k].category_id) for k in range(len(SKUS))])
    cat_of_series = categories[skus]

    effects = calibration["frnlt"]["effects_log_sales"]["multipliers"]
    holiday_values = (calibration["frn50k"]["effects_log_sales"]["multipliers"]["public_holiday"],
                      effects["public_holiday"])
    fest_params = dict(wcfg["festivals"], public_holiday_multiplier=float(np.mean(holiday_values)))

    # Deterministic components.
    base = base_demand(seed, wcfg["demand"]["store_affinity_sd"])
    weekly = weekly_index(dates, calibration)
    parts = festival_parts(dates, events, calibration, fest_params)
    weather_m = weather_multiplier(dates, calibration, weather)[emirate_of_store()[stores]]
    depth = promotions(dates, wcfg["promotions"], seed)
    promo_m = promo_multiplier(depth, calibration)[skus]
    stock_unit = stockpiling_unit(dates, wcfg["stockpiling_2026"])
    # The anchors are market-level figures, so they are solved on demand WITHOUT this operator's own
    # promotions (whose random placement would otherwise leak into the festival and stockpiling sizes).
    market = base[:, None] * weekly[None, :] * weather_m

    # Anchor 1: the Ramadan amplitude that gives the cited Ramadan-season share (full years only).
    years = tuple(y for y in range(dates[n_warmup].year, dates[-1].year + 1)
                  if pd.Timestamp(f"{y}-01-01") >= dates[n_warmup] and pd.Timestamp(f"{y}-12-31") <= dates[-1])

    def total(amplitude: float, stock_amp: float = 0.0) -> np.ndarray:
        fest = parts.multiplier(amplitude)[cat_of_series]
        return (market * fest * (1.0 + stock_amp * stock_unit[cat_of_series])).sum(axis=0)

    amplitude = _bisect(lambda a: ramadan_season_share(total(a), dates, events, fest_params, years),
                        0.0, 10.0, fest_params["ramadan_share_target"])

    # Anchor 2: the stockpiling amplitude that gives the cited Ramadan 2026 year-on-year volume growth.
    def yoy(stock_amp: float) -> float:
        t = total(amplitude, stock_amp)
        return ramadan_mean_daily(t, dates, events, 2026) / ramadan_mean_daily(t, dates, events, 2025) - 1.0

    yoy_without = yoy(0.0)
    stock_amp = _bisect(yoy, 0.0, 20.0, wcfg["stockpiling_2026"]["ramadan_yoy_target"])
    festival = parts.multiplier(amplitude)
    stockpile = 1.0 + stock_amp * stock_unit
    expected = market * promo_m * festival[cat_of_series] * stockpile[cat_of_series]

    # Random multipliers: store shocks, store-wide surges and item spikes.
    dcfg = wcfg["demand"]
    rng = rng_for(seed, "store-shock")
    sd = dcfg["store_shock_sd"]
    shock = np.exp(rng.normal(-0.5 * sd ** 2, sd, size=(len(STORES), n_days)))
    rng = rng_for(seed, "store-surge")
    surge_on = rng.random((len(STORES), n_days)) < dcfg["store_event_rate_per_year"] / 365.0
    surge = np.where(surge_on, np.maximum(1.2, np.exp(rng.normal(np.log(dcfg["store_event_median"]),
                                                                   dcfg["store_event_log_sd"], surge_on.shape))), 1.0)
    rng = rng_for(seed, "item-spike")
    spike_on = rng.random((stores.size, n_days)) < dcfg["item_spike_rate"]
    spike = np.where(spike_on, np.maximum(1.25, np.exp(rng.normal(np.log(dcfg["item_spike_median"]),
                                                                    dcfg["item_spike_log_sd"], spike_on.shape))), 1.0)
    multiplier = shock[stores] * surge[stores] * spike
    event_kind = np.full((stores.size, n_days), EVENT_NONE, dtype=np.int8)
    event_kind[spike_on] = EVENT_ITEM_SPIKE
    event_kind[surge_on[stores]] = EVENT_STORE_SURGE
    event_kind[(stock_unit[cat_of_series] > 0)] = EVENT_STOCKPILING

    # Daily negative-binomial noise (gamma-Poisson), dispersion set per series so the noise CV is noise_cv.
    horizon = slice(n_warmup, n_days)
    mean_level = expected[:, horizon].mean(axis=1)
    inv_r = np.maximum(dcfg["noise_cv"] ** 2 - 1.0 / mean_level, 0.005)
    rng = rng_for(seed, "daily-noise")
    intensity = rng.gamma(shape=1.0 / inv_r[:, None], scale=(expected * multiplier) * inv_r[:, None])

    # Hourly split: Dirichlet around the calibrated profile (Ramadan profile on Ramadan days), then Poisson.
    normal = np.asarray(calibration["uae"]["intraday_profile_normal"]["values"], dtype=float)
    ramadan = np.asarray(calibration["uae"]["intraday_profile_ramadan"]["values"], dtype=float)
    profile = np.where((parts.labels["ramadan_day"].to_numpy() > 0)[:, None], ramadan / ramadan.sum(),
                       normal / normal.sum())
    alpha = dcfg["hourly_concentration"] * profile                      # (d, 24)
    rng_split, rng_count = rng_for(seed, "hourly-split"), rng_for(seed, "hourly-count")
    demand_h = np.empty((stores.size, n_days, HOURS), dtype=np.int32)
    for s in range(len(STORES)):                                        # one store at a time bounds memory
        rows = slice(s * len(SKUS), (s + 1) * len(SKUS))
        g = rng_split.gamma(np.broadcast_to(alpha, (len(SKUS), n_days, HOURS)))
        shares = g / g.sum(axis=2, keepdims=True)
        demand_h[rows] = rng_count.poisson(intensity[rows][:, :, None] * shares)

    params = {
        "generator": f"freshpipe {__version__}",
        "ramadan_amplitude": round(amplitude, 6),
        "ramadan_share_achieved": round(ramadan_season_share(total(amplitude, stock_amp), dates, events,
                                                             fest_params, years), 6),
        "ramadan_share_years": list(years),
        "stockpiling_amplitude": round(stock_amp, 6),
        "ramadan_2026_yoy_without_stockpiling": round(yoy_without, 6),
        "ramadan_2026_yoy_achieved": round(yoy(stock_amp), 6),
        "public_holiday_multiplier": round(fest_params["public_holiday_multiplier"], 6),
        "negative_binomial_inverse_dispersion": {"min": round(float(inv_r.min()), 6),
                                                 "max": round(float(inv_r.max()), 6)},
    }
    return World(seed=seed, dates=dates, n_warmup=n_warmup, expected=expected.astype(np.float32),
                 multiplier=multiplier.astype(np.float32), demand_h=demand_h, promo_depth=depth.astype(np.float32),
                 event_kind=event_kind, day_labels=parts.labels, series_sku=skus, params=params)


# --- Persistence ------------------------------------------------------------------------------------------------

def checksum(array: np.ndarray) -> str:
    """SHA-256 of an array's bytes (C order), for reproducibility checks."""
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


def save_world(world: World, folder: Path | None = None) -> Path:
    """Write the world to data/synthetic/ (gitignored; rebuilt from the seed)."""
    folder = folder or repo_path("synthetic")
    folder.mkdir(parents=True, exist_ok=True)
    if world.demand_h.max() > np.iinfo(np.int16).max:
        raise ValueError("hourly demand exceeds int16; widen the stored type")
    np.savez_compressed(folder / "world.npz", expected=world.expected, multiplier=world.multiplier,
                        demand_h=world.demand_h.astype(np.int16), promo_depth=world.promo_depth,
                        event_kind=world.event_kind)
    world.day_labels.to_parquet(folder / "world_days.parquet", index=False)
    manifest = {"seed": world.seed, "n_warmup": world.n_warmup, "first_day": str(world.dates[0].date()),
                "last_day": str(world.dates[-1].date()), "series": series_ids(), "params": world.params,
                "checksums": {"demand_h": checksum(world.demand_h.astype(np.int16)),
                              "expected": checksum(world.expected)}}
    (folder / "world_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    return folder


def load_world(folder: Path | None = None) -> World:
    """Read a saved world back."""
    folder = folder or repo_path("synthetic")
    manifest = json.loads((folder / "world_manifest.json").read_text(encoding="utf-8"))
    arrays = np.load(folder / "world.npz")
    labels = pd.read_parquet(folder / "world_days.parquet")
    dates = pd.date_range(manifest["first_day"], manifest["last_day"], freq="D")
    return World(seed=manifest["seed"], dates=dates, n_warmup=manifest["n_warmup"], expected=arrays["expected"],
                 multiplier=arrays["multiplier"], demand_h=arrays["demand_h"].astype(np.int32),
                 promo_depth=arrays["promo_depth"], event_kind=arrays["event_kind"], day_labels=labels,
                 series_sku=series_index()[1], params=manifest["params"])

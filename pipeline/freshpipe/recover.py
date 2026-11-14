"""Demand recovery: estimate the demand that stockouts hid (task P3-01, plan §3.5).

The operator only records sales. When a shelf is empty, demand in those hours is never seen, so a
history of recorded sales under-states true demand exactly where it matters most (busy days).

Two methods, both working from hourly sales plus binary stock flags, which is all a real operator has:

1. **Profile imputation** (`profile_recovery`). The day's demand level is estimated from the hours that
   were in stock: level = in-stock sales ÷ the intraday-profile mass of those hours. A same-weekday
   prior (the recovered demand of the last four same weekdays) is blended in with weight `alpha`
   (a pseudo-mass), so a day that was empty almost all day leans on its history instead of on one or
   two noisy hours. Each out-of-stock hour gets level × profile share, and never less than what it
   actually sold (a "transition hour" sells until the shelf empties, so its sales are a lower bound).
2. **ML recovery** (`ml_recovery`). A gradient-boosted model (scikit-learn HistGradientBoosting,
   Poisson loss) learns hourly demand from in-stock hours only, with the profile estimate, the hour,
   the weekday, the calendar and the announced promotion as features, then predicts the stockout
   hours. Training rows use a leave-this-hour-out profile estimate, so the target never leaks.

The plan keeps the simplest method that meets the target; `evaluate` scores both against a known truth.
Profiles are estimated per series from fully in-stock days in a fitting window, shrunk towards the
category profile when a series has few such days. Ramadan days use a category-level Ramadan profile.

Conventions: arrays are [series, day, hour]; `oos` is True when the hour ended out of stock (the
FreshRetailNet `hours_stock_status` meaning, see `clean.decode_stock_flags`).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

HOURS = 24
#: Pseudo-mass of the same-weekday prior (validated in `choose_alpha`; ASSUMPTION within that grid).
DEFAULT_ALPHA = 0.10
#: Pseudo-count (units) that shrinks a series profile towards its category profile.
PROFILE_SHRINK_UNITS = 50.0
PRIOR_WEEKS = 4


@dataclass
class Recovery:
    """Recovered demand. `hourly` equals recorded sales in in-stock hours."""

    method: str
    daily: np.ndarray                     # (n, d)
    hourly: np.ndarray                    # (n, d, 24)
    params: dict[str, object] = field(default_factory=dict)


# --- Profiles ----------------------------------------------------------------------------------------------

def fully_in_stock(oos: np.ndarray) -> np.ndarray:
    """(n, d) True on days with no out-of-stock hour at all."""
    return ~oos.any(axis=2)


def _normalise(counts: np.ndarray) -> np.ndarray:
    total = counts.sum(axis=-1, keepdims=True)
    return np.where(total > 0, counts / np.where(total > 0, total, 1.0), 1.0 / counts.shape[-1])


def estimate_profiles(sales_h: np.ndarray, oos: np.ndarray, groups: np.ndarray, special_day: np.ndarray,
                      fit_days: np.ndarray, shrink_units: float = PROFILE_SHRINK_UNITS) -> dict[str, np.ndarray]:
    """Intraday profiles from fully in-stock days inside `fit_days`.

    - `normal` (n, 24): per series, shrunk towards its group (category) profile with `shrink_units`
      pseudo-units, so a thin series borrows shape from its category.
    - `special` (n, 24): the group profile measured on `special_day` days (Ramadan), applied per series
      as normal × (group special ÷ group normal), so each series keeps its own shape.
    """
    clean = fully_in_stock(oos) & fit_days[None, :]
    normal_days = clean & ~special_day[None, :]
    special_days = clean & special_day[None, :]
    series_counts = (sales_h * normal_days[:, :, None]).sum(axis=1).astype(float)       # (n, 24)
    special_counts = (sales_h * special_days[:, :, None]).sum(axis=1).astype(float)
    n_groups = int(groups.max()) + 1
    group_normal = np.zeros((n_groups, HOURS))
    group_special = np.zeros((n_groups, HOURS))
    np.add.at(group_normal, groups, series_counts)
    np.add.at(group_special, groups, special_counts)
    group_normal, group_special = _normalise(group_normal), _normalise(group_special)
    normal = _normalise(series_counts + shrink_units * group_normal[groups])
    ratio = np.where(group_normal > 0, group_special / np.where(group_normal > 0, group_normal, 1.0), 1.0)
    special = _normalise(normal * ratio[groups])
    return {"normal": normal, "special": special}


def day_profiles(profiles: dict[str, np.ndarray], special_day: np.ndarray) -> np.ndarray:
    """(n, d, 24) the profile that applies to each series-day."""
    return np.where(special_day[None, :, None], profiles["special"][:, None, :], profiles["normal"][:, None, :])


# --- Method 1: profile imputation ---------------------------------------------------------------------------

def _weekday_prior(rec_daily: np.ndarray, t: int, fallback: np.ndarray) -> np.ndarray:
    """Mean recovered demand of the last PRIOR_WEEKS same weekdays before day t (fallback before that)."""
    cols = [t - 7 * k for k in range(1, PRIOR_WEEKS + 1) if t - 7 * k >= 0]
    return rec_daily[:, cols].mean(axis=1) if cols else fallback


def profile_recovery(sales_h: np.ndarray, oos: np.ndarray, prof: np.ndarray, alpha: float | np.ndarray = DEFAULT_ALPHA,
                     fallback_level: np.ndarray | None = None) -> Recovery:
    """Recover demand day by day (method 1). Pure function of its inputs.

    level(t) = (in-stock sales + alpha × prior) ÷ (in-stock profile mass + alpha), where prior is the
    mean recovered demand of the last four same weekdays. With alpha = 0 the prior is used only when
    the in-stock mass is below 5% of the day.
    """
    n, d, _ = sales_h.shape
    sales = sales_h.astype(float)
    in_stock = ~oos
    s_in = (sales * in_stock).sum(axis=2)                     # (n, d)
    m_in = (prof * in_stock).sum(axis=2)
    if fallback_level is None:
        clean = fully_in_stock(oos)
        days = np.maximum(clean.sum(axis=1), 1)
        fallback_level = (sales.sum(axis=2) * clean).sum(axis=1) / days
    rec_daily = np.zeros((n, d))
    rec_h = np.where(in_stock, sales, 0.0)
    a = np.broadcast_to(np.asarray(alpha, dtype=float), (n,))
    for t in range(d):
        prior = _weekday_prior(rec_daily, t, fallback_level)
        blended = (s_in[:, t] + a * prior) / np.maximum(m_in[:, t] + a, 1e-9)
        raw = np.where(m_in[:, t] >= 0.05, s_in[:, t] / np.maximum(m_in[:, t], 1e-9), prior)
        level = np.where(a > 0, blended, raw)
        hidden = np.maximum(sales[:, t], level[:, None] * prof[:, t])        # lower bound: what it sold
        rec_h[:, t] = np.where(oos[:, t], hidden, sales[:, t])
        rec_daily[:, t] = rec_h[:, t].sum(axis=1)
    return Recovery("profile", rec_daily, rec_h, {"alpha": np.asarray(alpha).round(4).tolist(), "prior_weeks": PRIOR_WEEKS})


# --- Method 2: ML recovery -------------------------------------------------------------------------------------

#: Feature columns of the hourly recovery model, in order.
ML_FEATURES = ("hour", "weekday", "special_day", "event_code", "promo_depth", "profile_share",
               "profile_level_ratio", "observed_mass", "group")


def _ml_frame(sel: tuple[np.ndarray, np.ndarray, np.ndarray], level: np.ndarray, prior: np.ndarray,
              prof: np.ndarray, m_in: np.ndarray, weekday: np.ndarray, special_day: np.ndarray,
              event_code: np.ndarray, promo: np.ndarray, groups: np.ndarray) -> np.ndarray:
    """Feature matrix for the (series, day, hour) triples in `sel`. Levels enter relative to the prior."""
    s, t, h = sel
    base = np.maximum(prior[s, t], 1e-6)
    return np.column_stack([h, weekday[t], special_day[t], event_code[t], promo[s, t], prof[s, t, h],
                            level / base, m_in[s, t], groups[s]]).astype(np.float32)


def ml_recovery(sales_h: np.ndarray, oos: np.ndarray, prof: np.ndarray, base: Recovery, *, weekday: np.ndarray,
                special_day: np.ndarray, event_code: np.ndarray, promo: np.ndarray, groups: np.ndarray,
                fit_days: np.ndarray, seed: int, max_rows: int = 1_500_000) -> Recovery:
    """Recover demand with an hourly gradient-boosted model trained on in-stock hours (method 2).

    `base` (the profile recovery) supplies the same-weekday prior. The target is hourly sales ÷ prior,
    so one global model serves series of very different sizes.
    """
    from sklearn.ensemble import HistGradientBoostingRegressor  # local import keeps module import light

    n, d, _ = sales_h.shape
    sales = sales_h.astype(float)
    in_stock = ~oos
    s_in = (sales * in_stock).sum(axis=2)
    m_in = (prof * in_stock).sum(axis=2)
    prior = np.zeros((n, d))
    fallback = base.daily.mean(axis=1)
    for t in range(d):
        prior[:, t] = _weekday_prior(base.daily, t, fallback)

    # Training rows: in-stock hours in the fitting window, with a leave-this-hour-out level.
    rng = np.random.default_rng(seed)
    cand = np.argwhere(in_stock & fit_days[None, :, None])
    if len(cand) > max_rows:
        cand = cand[rng.choice(len(cand), max_rows, replace=False)]
    s, t, h = cand.T
    m_loo = m_in[s, t] - prof[s, t, h]
    level_loo = np.where(m_loo >= 0.05, (s_in[s, t] - sales[s, t, h]) / np.maximum(m_loo, 1e-9), prior[s, t])
    x = _ml_frame((s, t, h), level_loo, prior, prof, m_in, weekday, special_day, event_code, promo, groups)
    x[:, ML_FEATURES.index("observed_mass")] = m_loo      # the mass the leave-one-out level was built from
    y = sales[s, t, h] / np.maximum(prior[s, t], 1e-6)
    model = HistGradientBoostingRegressor(loss="poisson", max_iter=300, learning_rate=0.08, max_leaf_nodes=63,
                                          min_samples_leaf=200, l2_regularization=1.0,
                                          categorical_features=[ML_FEATURES.index("group")], random_state=seed)
    model.fit(x, y)

    # Predict every out-of-stock hour, then apply the same lower bound as method 1.
    target = np.argwhere(oos)
    s, t, h = target.T
    level = np.where(m_in[s, t] >= 0.05, s_in[s, t] / np.maximum(m_in[s, t], 1e-9), prior[s, t])
    pred = model.predict(_ml_frame((s, t, h), level, prior, prof, m_in, weekday, special_day, event_code, promo,
                                   groups)) * np.maximum(prior[s, t], 1e-6)
    rec_h = np.where(in_stock, sales, 0.0)
    rec_h[s, t, h] = np.maximum(sales[s, t, h], pred)
    return Recovery("ml", rec_h.sum(axis=2), rec_h, {"model": "HistGradientBoostingRegressor(poisson)",
                                                     "training_rows": int(len(cand)), "features": list(ML_FEATURES)})


# --- Evaluation ------------------------------------------------------------------------------------------------

def wape(pred: np.ndarray, truth: np.ndarray) -> float:
    """Σ|pred − truth| ÷ Σ truth (plan §1.2)."""
    return float(np.abs(pred - truth).sum() / truth.sum())


def wpe(pred: np.ndarray, truth: np.ndarray) -> float:
    """Σ(pred − truth) ÷ Σ truth; negative = under-estimate (the paper's sign convention)."""
    return float((pred - truth).sum() / truth.sum())


def evaluate(rec: Recovery, truth_h: np.ndarray, sales_h: np.ndarray, oos: np.ndarray,
             days: np.ndarray | None = None) -> dict[str, float]:
    """Score a recovery against known hourly truth.

    - `hidden_wape` / `hidden_wpe`: per series-day, the demand in out-of-stock hours (the hidden part),
      over series-days with any out-of-stock hour. This is the headline recovery metric.
    - `hourly_wape`: the same, hour by hour (noisier: it includes hour-level Poisson noise).
    - `daily_wpe`: bias of recovered vs true daily demand over all series-days.
    - `naive_daily_wpe`: the same for recorded sales (how much the raw history under-states demand).
    """
    days = np.ones(truth_h.shape[1], dtype=bool) if days is None else days
    t, r, s, o = truth_h[:, days].astype(float), rec.hourly[:, days], sales_h[:, days].astype(float), oos[:, days]
    hidden_t, hidden_r = (t * o).sum(axis=2), (r * o).sum(axis=2)
    hit = o.any(axis=2)
    return {
        "hidden_wape": round(wape(hidden_r[hit], hidden_t[hit]), 4),
        "hidden_wpe": round(wpe(hidden_r[hit], hidden_t[hit]), 4),
        "hourly_wape": round(wape(r[o], t[o]), 4),
        "stockout_day_wape": round(wape(r.sum(axis=2)[hit], t.sum(axis=2)[hit]), 4),
        "daily_wpe": round(wpe(r.sum(axis=2), t.sum(axis=2)), 4),
        "naive_daily_wpe": round(wpe(s.sum(axis=2), t.sum(axis=2)), 4),
        "stockout_series_days": int(hit.sum()),
    }


def choose_alpha(sales_h: np.ndarray, oos: np.ndarray, prof: np.ndarray, truth_h: np.ndarray,
                 days: np.ndarray, grid: tuple[float, ...] = (0.0, 0.05, 0.1, 0.2, 0.4)) -> tuple[float, dict]:
    """Pick the prior weight on validation days by the hidden-demand WAPE."""
    scores = {a: evaluate(profile_recovery(sales_h, oos, prof, alpha=a), truth_h, sales_h, oos, days)
              for a in grid}
    best = min(grid, key=lambda a: scores[a]["hidden_wape"])
    return best, {str(a): v for a, v in scores.items()}


# --- The synthetic world under P0 -------------------------------------------------------------------------------

def world_inputs(world, config: dict) -> dict[str, np.ndarray]:
    """Calendar-side inputs a real operator would know: Ramadan days, event codes, weekdays, promotions, splits."""
    import pandas as pd

    from .world import CATEGORIES, SKUS

    h = world.horizon
    dates = world.dates[h]
    labels = world.day_labels.iloc[world.n_warmup:].reset_index(drop=True)
    events = sorted(labels["event"].unique())
    splits = config["splits"]
    return {
        "dates": dates,
        "special_day": labels["ramadan_day"].to_numpy() > 0,
        "event_code": labels["event"].map({e: i for i, e in enumerate(events)}).to_numpy(),
        "weekday": dates.dayofweek.to_numpy(),
        "promo": world.promo_by_series[:, h],
        "groups": np.array([[c.id for c in CATEGORIES].index(SKUS[k].category_id) for k in world.series_sku]),
        "fit": np.asarray(dates <= pd.Timestamp(splits["train_end"])),
        "validation": np.asarray((dates > pd.Timestamp(splits["train_end"]))
                                 & (dates <= pd.Timestamp(splits["validation_end"]))),
        "test": np.asarray(dates >= pd.Timestamp(splits["test_start"])),
    }


def recover_p0(world, sales_h: np.ndarray, oos: np.ndarray, config: dict, with_ml: bool = True) -> tuple[Recovery, dict]:
    """Recover the P0 history of the synthetic world and score both methods against the known truth.

    `sales_h` and `oos` cover the horizon only (as saved by `simulate.save_run`). Returns the chosen
    recovery (profile imputation, the simpler method, unless ML beats it on validation) and a report.
    """
    inp = world_inputs(world, config)
    truth = world.demand_h[:, world.horizon]
    profiles = estimate_profiles(sales_h, oos, inp["groups"], inp["special_day"], inp["fit"])
    prof = day_profiles(profiles, inp["special_day"])
    alpha, sweep = choose_alpha(sales_h, oos, prof, truth, inp["validation"])
    chosen = profile_recovery(sales_h, oos, prof, alpha=alpha)
    windows = {"validation": inp["validation"], "test": inp["test"], "all": None}
    report: dict[str, object] = {
        "alpha": alpha, "alpha_sweep_validation": sweep,
        "profile": {k: evaluate(chosen, truth, sales_h, oos, v) for k, v in windows.items()},
    }
    # The oracle knows each day's TRUE total and splits it by the profile: the floor for any level-based method.
    o = oos[:, inp["validation"]]
    t = truth[:, inp["validation"]].astype(float)
    hit = o.any(axis=2)
    oracle_hidden = t.sum(axis=2) * (prof[:, inp["validation"]] * o).sum(axis=2)
    report["oracle_validation"] = {"hidden_wape": round(wape(oracle_hidden[hit], (t * o).sum(axis=2)[hit]), 4),
                                   "hourly_wape": round(wape((t.sum(axis=2, keepdims=True)
                                                              * prof[:, inp["validation"]])[o], t[o]), 4)}
    if with_ml:
        ml = ml_recovery(sales_h, oos, prof, chosen, weekday=inp["weekday"], special_day=inp["special_day"],
                         event_code=inp["event_code"], promo=inp["promo"], groups=inp["groups"], fit_days=inp["fit"],
                         seed=world.seed)
        report["ml"] = {k: evaluate(ml, truth, sales_h, oos, v) for k, v in windows.items()}
        if report["ml"]["validation"]["hidden_wape"] < report["profile"]["validation"]["hidden_wape"]:
            chosen = ml
    report["chosen"] = chosen.method
    return chosen, report

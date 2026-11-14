"""Unannounced spike detection within the day (task P3-05, plan §3.7).

Each trading hour (06:00-21:59) the detector compares what actually sold with what the forecast
expected: expected demand in hour h = P50 daily forecast × the series' intraday profile share.

- **Poisson CUSUM.** S_h = max(0, S_{h-1} + a_h·ln r − (r − 1)·e_h), the log-likelihood-ratio CUSUM for
  a jump of the hourly rate from e_h to r·e_h (Page, 1954). It accumulates evidence hour by hour and
  alarms at S_h ≥ H.
- **Ratio guard.** The alarm also needs cumulative actual ÷ cumulative expected ≥ `ratio_min`, so a
  small absolute excess on a tiny forecast cannot trigger it on its own.

Thresholds (r, H, ratio_min) are tuned on the Jul-Dec 2025 validation window to detect as many labelled
spikes as possible with at most `max_false_alarms` false alarms per store-week. Validation uses a
forecast fitted on Jan 2023-Jun 2025 only, so the thresholds see out-of-sample forecast error.
Scoring is on Jan-Oct 2026: detection rate, median delay (trading hours until the alarm) and false
alarms per store-week, at item level and for a store-level detector that pools a store's 40 SKUs.

Observed stream: hourly demand as an AI-Intraday shelf view sees it (plan §4.5, P2). A sensitivity
run on the censored P0 sales stream shows what stockouts do to detection.
"""

from __future__ import annotations

from itertools import product

import numpy as np

from .clean import TRADING_HOURS

#: Tuning grid (r, H, ratio_min). Small on purpose: three numbers a board can follow.
GRID_R = (1.5, 2.0, 2.5)
GRID_H = (2.0, 4.0, 6.0, 9.0, 13.0, 18.0, 25.0, 35.0)
GRID_RATIO = (1.3, 1.5, 1.8, 2.2, 2.6)
MAX_FALSE_ALARMS_PER_STORE_WEEK = 1.0


def first_alarm(actual: np.ndarray, expected: np.ndarray, r: float, h: float, ratio_min: float) -> np.ndarray:
    """First trading hour (0-15) of an alarm per row, or -1. `actual`, `expected`: (rows, 16)."""
    log_r = np.log(r)
    s = np.zeros(actual.shape[0])
    cum_a = np.zeros(actual.shape[0])
    cum_e = np.zeros(actual.shape[0])
    alarm = np.full(actual.shape[0], -1)
    for k in range(actual.shape[1]):
        s = np.maximum(0.0, s + actual[:, k] * log_r - (r - 1.0) * expected[:, k])
        cum_a += actual[:, k]
        cum_e += expected[:, k]
        fire = (alarm < 0) & (s >= h) & (cum_a >= ratio_min * np.maximum(cum_e, 1e-9))
        alarm[fire] = k
    return alarm


def evaluate_alarms(alarm: np.ndarray, positive: np.ndarray, n_stores: int, n_days: int) -> dict[str, float]:
    """Detection rate and median delay on positives; false alarms per store-week on negatives."""
    detected = alarm >= 0
    weeks = n_days / 7.0
    delays = alarm[positive & detected] + 1          # trading hours observed when the alarm fires
    return {"detection_rate": round(float(detected[positive].mean()) if positive.any() else 0.0, 4),
            "median_delay_hours": float(np.median(delays)) if delays.size else None,
            "false_alarms_per_store_week": round(float((detected & ~positive).sum()) / (n_stores * weeks), 4),
            "positives": int(positive.sum())}


def tune(actual: np.ndarray, expected: np.ndarray, positive: np.ndarray, n_stores: int, n_days: int,
         max_fa: float = MAX_FALSE_ALARMS_PER_STORE_WEEK) -> tuple[dict[str, float], dict[str, float]]:
    """Grid-search (r, H, ratio_min): best detection with false alarms ≤ max_fa (else the fewest alarms)."""
    best_key, best_val = None, None
    for r, h, ratio in product(GRID_R, GRID_H, GRID_RATIO):
        m = evaluate_alarms(first_alarm(actual, expected, r, h, ratio), positive, n_stores, n_days)
        ok = m["false_alarms_per_store_week"] <= max_fa
        key = (ok, m["detection_rate"] if ok else -m["false_alarms_per_store_week"],
               -(m["median_delay_hours"] or 99))
        if best_key is None or key > best_key:
            best_key, best_val = key, ({"r": r, "h": h, "ratio_min": ratio}, m)
    return best_val


def hourly_window(stream: np.ndarray, p50: np.ndarray, prof: np.ndarray, days: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(series × days, 16) actual and expected trading-hour values for the day mask `days`."""
    a = stream[:, days][:, :, TRADING_HOURS].astype(float)
    e = (p50[:, days, None] * prof[:, days][:, :, TRADING_HOURS])
    return a.reshape(-1, a.shape[2]), e.reshape(-1, e.shape[2])


def pooled(x: np.ndarray, n_stores: int) -> np.ndarray:
    """Sum (series × days, 16) rows over the SKUs of each store: series are store-major."""
    n_series = x.shape[0]
    return x.reshape(n_stores, -1, *x.shape[1:]).sum(axis=1) if n_series % n_stores == 0 else x


def detector_report(stream_true: np.ndarray, stream_censored: np.ndarray, p50_val: np.ndarray,
                    p50_test: np.ndarray, prof: np.ndarray, event_kind: np.ndarray, multiplier: np.ndarray,
                    val_days: np.ndarray, test_days: np.ndarray, n_stores: int) -> dict[str, object]:
    """Tune on validation, score on test; item level and store level; plus the censored-stream sensitivity."""
    n = stream_true.shape[0]
    per_store = n // n_stores
    out: dict[str, object] = {}

    # Item level: every labelled unannounced event (item spike, store surge, stockpiling) counts as positive.
    a_v, e_v = hourly_window(stream_true, p50_val, prof, val_days)
    pos_v = (event_kind[:, val_days] > 0).reshape(-1)
    params, val_metrics = tune(a_v, e_v, pos_v, n_stores, int(val_days.sum()))
    a_t, e_t = hourly_window(stream_true, p50_test, prof, test_days)
    kind_t = event_kind[:, test_days].reshape(-1)
    alarm = first_alarm(a_t, e_t, **params)
    item = {"params": params, "validation": val_metrics,
            "test": evaluate_alarms(alarm, kind_t > 0, n_stores, int(test_days.sum()))}
    mag = multiplier[:, test_days].reshape(-1)
    bands = {"1.25-1.5x": (1.25, 1.5), "1.5-2x": (1.5, 2.0), "2-3x": (2.0, 3.0), "3x+": (3.0, np.inf)}
    item["test_by_magnitude"] = {b: evaluate_alarms(alarm, (kind_t > 0) & (mag >= lo) & (mag < hi), n_stores,
                                                    int(test_days.sum()))["detection_rate"] for b, (lo, hi) in bands.items()}
    item["test_by_kind"] = {name: evaluate_alarms(alarm, kind_t == code, n_stores, int(test_days.sum()))
                            for code, name in ((1, "item_spike"), (2, "store_surge"), (3, "stockpiling"))}
    a_c, _ = hourly_window(stream_censored, p50_test, prof, test_days)
    item["test_censored_stream"] = evaluate_alarms(first_alarm(a_c, e_t, **params), kind_t > 0, n_stores,
                                                   int(test_days.sum()))
    out["item"] = item

    # Store level: pool a store's SKUs; positives are store-wide events (surges, stockpiling).
    def store_rows(a: np.ndarray, e: np.ndarray, days: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        d = int(days.sum())
        return (a.reshape(n_stores, per_store, d, -1).sum(axis=1).reshape(n_stores * d, -1),
                e.reshape(n_stores, per_store, d, -1).sum(axis=1).reshape(n_stores * d, -1))

    def store_positive(days: np.ndarray) -> np.ndarray:
        k = event_kind[:, days].reshape(n_stores, per_store, -1)
        return np.isin(k, (2, 3)).any(axis=1).reshape(-1)

    sa_v, se_v = store_rows(a_v, e_v, val_days)
    s_params, s_val = tune(sa_v, se_v, store_positive(val_days), n_stores, int(val_days.sum()),
                           max_fa=MAX_FALSE_ALARMS_PER_STORE_WEEK / 7.0)
    sa_t, se_t = store_rows(a_t, e_t, test_days)
    out["store"] = {"params": s_params, "validation": s_val,
                    "test": evaluate_alarms(first_alarm(sa_t, se_t, **s_params), store_positive(test_days), n_stores,
                                            int(test_days.sum())),
                    "note": "Store-level false alarms are capped at 1 per store per 7 weeks (one alarm covers 40 SKUs)."}
    return out

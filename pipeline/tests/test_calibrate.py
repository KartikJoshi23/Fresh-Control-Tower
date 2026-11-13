"""Calibration maths verified on simulated data with known answers."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from freshpipe import calibrate


def test_within_series_ols_recovers_known_effects_despite_series_levels() -> None:
    rng = np.random.default_rng(2026)
    n_series, days = 300, 60
    series = np.repeat(np.arange(n_series), days)
    level = rng.normal(0, 2.0, n_series)[series]          # large fixed effects to be removed
    depth = rng.uniform(0, 0.3, series.size)
    weekend = rng.integers(0, 2, series.size).astype(float)
    y = level + 0.8 * depth + 0.15 * weekend + rng.normal(0, 0.05, series.size)
    frame = pd.DataFrame({"s": series, "y": y, "depth": depth, "weekend": weekend})
    fit = calibrate.within_series_ols(frame, "y", ["depth", "weekend"], ["s"])
    assert fit["coefficients"]["depth"] == pytest.approx(0.8, abs=0.02)
    assert fit["coefficients"]["weekend"] == pytest.approx(0.15, abs=0.01)
    # Theory: within R² = signal / (signal + noise) = (0.8²·0.3²/12 + 0.15²·0.25) / (… + 0.05²) ≈ 0.806
    signal = 0.8 ** 2 * 0.3 ** 2 / 12 + 0.15 ** 2 * 0.25
    assert fit["n"] == series.size
    assert fit["r2_within"] == pytest.approx(signal / (signal + 0.05 ** 2), abs=0.02)


def test_festival_shape_reports_the_pre_week_uplift() -> None:
    dates = pd.date_range("2023-01-01", "2023-03-31", freq="D")
    values = pd.Series(100.0, index=dates)
    event = pd.Timestamp("2023-02-15")
    values[(dates >= event - pd.Timedelta(days=7)) & (dates < event)] = 200.0
    values[event] = np.nan  # a closure on the day itself
    shape = calibrate.festival_shape(values, ["2023-02-15"])
    assert shape["pre_week_index"] == pytest.approx(2.0)
    assert shape["post_week_index"] == pytest.approx(1.0)
    assert shape["mean_index"][14] is None  # closure stays missing, not zero


def test_rolling_ratio_flags_a_five_times_spike() -> None:
    values = pd.Series(100.0, index=pd.date_range("2023-01-01", periods=60, freq="D"))
    values.iloc[30] = 500.0
    assert calibrate.rolling_ratio(values).iloc[30] == pytest.approx(5.0)


def test_quantiles_are_named_and_ignore_nan() -> None:
    q = calibrate.quantiles(pd.Series([1.0, 2.0, 3.0, np.nan]), (0.5,))
    assert q == {"p50": 2.0}


def test_ramadan_profile_moves_demand_to_the_evening_and_still_sums_to_one() -> None:
    normal = [1 / 24] * 24
    ramadan = calibrate.ramadan_profile(normal)
    assert sum(ramadan) == pytest.approx(1.0, abs=1e-4)
    assert ramadan[22] > normal[22] > ramadan[10]


def test_uae_weekly_index_puts_friday_halfway_and_weekend_on_saturday_sunday() -> None:
    measured = [0.9] * 5 + [1.2] * 2
    week = calibrate.uae_weekly_index(measured, measured, measured)
    index = week["index_mon_to_sun"]
    assert index[5] == index[6] > index[4] > index[0]
    assert index[4] == pytest.approx((index[0] + index[5]) / 2, abs=1e-4)  # values are rounded to 4 dp
    assert np.mean(index) == pytest.approx(1.0, abs=1e-3)
    assert week["weekend_uplift_vs_weekday"] == pytest.approx(1.2 / 0.9, abs=1e-3)

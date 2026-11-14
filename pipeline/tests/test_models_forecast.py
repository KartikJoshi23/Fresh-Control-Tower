"""Forecasting (P3-03), ablation (P3-04) and spike detection (P3-05): worked examples, a leakage test and
golden checks on the committed Part 3 outputs.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd
import pytest

from freshpipe import forecast, spikes
from freshpipe.config import repo_path


def small_inputs(n: int = 4, d: int = 240, seed: int = 0) -> tuple[np.ndarray, forecast.Inputs]:
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2024-01-01", periods=d)
    weekly = np.array([0.9, 0.9, 0.9, 0.9, 1.0, 1.2, 1.2])[dates.dayofweek]
    y = rng.poisson(20 * weekly[None, :] * np.linspace(1, 2, n)[:, None]).astype(float)
    labels = pd.DataFrame({"event": "", "ramadan_day": 0, "public_holiday": False, "summer_break": False}, index=range(d))
    inp = forecast.Inputs(dates, forecast.calendar_features(dates, [], labels),
                          {"t_mean": np.full((n, d), 30.0), "precip": np.zeros((n, d))},
                          np.zeros((n, d)), np.arange(n) % 8, np.arange(n))
    return y, inp


def test_days_from_nearest_event() -> None:
    dates = pd.date_range("2026-02-10", periods=5)
    out = forecast.days_from(dates, [pd.Timestamp("2026-02-12").date()], clip=60)
    assert out.tolist() == [-2, -1, 0, 1, 2]
    assert forecast.days_from(dates, [pd.Timestamp("2025-01-01").date()], clip=60).tolist() == [60] * 5


def test_lag_and_rolling_mean_worked_example() -> None:
    y = np.arange(10, dtype=float)[None, :]
    assert forecast._lag(y, 3)[0, 3:].tolist() == [0, 1, 2, 3, 4, 5, 6]
    # Mean of days t-2-3+1 .. t-2 = mean(t-4 .. t-2); for t = 6: mean(2, 3, 4) = 3.
    roll = forecast._rolling_mean(y, 3, 2)
    assert np.isnan(roll[0, 3]) and roll[0, 6] == pytest.approx(3.0)


@pytest.mark.parametrize("bucket", [0, 1, 2])
def test_features_never_see_the_forecast_lead_time(bucket: int) -> None:
    # Changing any of the h_max days just before day t must not change day t's features (no leakage).
    y, inp = small_inputs()
    t = 200
    x, level, names = forecast.build_matrix(y, inp, bucket, tuple(forecast.FEATURE_GROUPS))
    h_max = forecast.BUCKETS[bucket][1]
    z = y.copy()
    z[:, t - h_max + 1:t + 1] += 1000.0
    x2, level2, _ = forecast.build_matrix(z, inp, bucket, tuple(forecast.FEATURE_GROUPS))
    row = np.arange(y.shape[0]) * y.shape[1] + t
    assert np.allclose(x[row], x2[row], equal_nan=True) and np.allclose(level[row], level2[row])
    assert ("t_mean" in names) == (bucket == 0)                  # weather only for the 1-7 day bucket


def test_quantile_models_do_not_cross_and_cover() -> None:
    y, inp = small_inputs()
    train = np.arange(y.shape[1]) < 180
    q = forecast.fit_predict(y, inp, train, bucket=0, seed=1)
    ok = ~np.isnan(q).any(axis=0)
    assert np.all(q[0][ok] <= q[1][ok]) and np.all(q[1][ok] <= q[2][ok])
    test = np.zeros(y.shape, dtype=bool)
    test[:, 180:] = True
    cov = forecast.score_quantiles(q, y, test)["coverage_p10_p90"]
    assert 0.6 <= cov <= 0.95                                    # Poisson noise, about 80% expected


def test_baselines_worked_example() -> None:
    y = np.tile(np.arange(7, dtype=float), 8)[None, :] + 10.0   # a pure weekly pattern
    assert np.allclose(forecast.seasonal_naive(y, 0)[0, 7:], y[0, 7:])
    assert np.allclose(forecast.seasonal_naive(y, 1)[0, 14:], y[0, 14:])
    assert forecast.moving_average(y, 0)[0, 40] == pytest.approx(13.0)      # mean of 4 full weeks of 10..16


def test_ets_tracks_a_weekly_season() -> None:
    rng = np.random.default_rng(2)
    y = (np.tile([10, 10, 10, 10, 12, 18, 18], 30) + rng.normal(0, 0.5, 210))[None, :]
    fc, params = forecast.ets_forecast(y, np.arange(210) < 150, 0)
    assert forecast.wape(fc[0, 160:], y[0, 160:]) < 0.06 and 0 <= params["alpha_median"] <= 1


def test_pinball_and_scores_worked_example() -> None:
    truth = np.array([10.0, 10.0])
    # q = 0.9: under-forecast by 2 costs 0.9 x 2 = 1.8; over-forecast by 2 costs 0.1 x 2 = 0.2 -> mean 1.0 / 10.
    assert forecast.pinball(np.array([8.0, 12.0]), truth, 0.9) == pytest.approx(0.1)
    q = np.array([[8.0, 11.0], [10.0, 12.0], [12.0, 13.0]])[:, None, :]
    out = forecast.score_quantiles(q, truth[None, :], np.ones((1, 2), dtype=bool))
    assert out["coverage_p10_p90"] == 0.5 and out["wape"] == pytest.approx(0.1) and out["wpe"] == pytest.approx(0.1)


# --- Spike detection --------------------------------------------------------------------------------------------

def test_poisson_cusum_worked_example() -> None:
    # Expected 1 unit an hour; actual 4. With r = 2 each hour adds 4 ln 2 - 1 = 1.7726, so S passes 5 after
    # three hours (5.32): the alarm fires at trading hour index 2. A day at the expected rate never alarms.
    expected = np.ones((2, 16))
    actual = np.vstack([np.full(16, 4.0), np.ones(16)])
    assert spikes.first_alarm(actual, expected, r=2.0, h=5.0, ratio_min=1.5).tolist() == [2, -1]
    assert 3 * (4 * math.log(2) - 1) > 5 > 2 * (4 * math.log(2) - 1)
    # The ratio guard blocks an alarm when the cumulative excess ratio is too small.
    assert spikes.first_alarm(actual, expected, r=2.0, h=5.0, ratio_min=5.0).tolist() == [-1, -1]


def test_alarm_metrics_worked_example() -> None:
    alarm = np.array([2, -1, 0, -1, 5])
    positive = np.array([True, True, False, False, True])
    out = spikes.evaluate_alarms(alarm, positive, n_stores=1, n_days=7)
    # 2 of 3 positives detected, delays 3 and 6 hours -> median 4.5; one false alarm in one store-week.
    assert out == {"detection_rate": 0.6667, "median_delay_hours": 4.5, "false_alarms_per_store_week": 1.0,
                   "positives": 3}


def test_tuning_respects_the_false_alarm_cap() -> None:
    rng = np.random.default_rng(4)
    expected = np.full((2800, 16), 2.0)
    actual = rng.poisson(expected).astype(float)
    positive = np.zeros(2800, dtype=bool)
    positive[:100] = True
    actual[:100] *= 3.0
    params, metrics = spikes.tune(actual, expected, positive, n_stores=10, n_days=280)
    assert metrics["false_alarms_per_store_week"] <= 1.0 and metrics["detection_rate"] > 0.9


# --- Golden checks on the committed Part 3 outputs -------------------------------------------------------------

@pytest.fixture(scope="module")
def report() -> dict:
    return json.loads((repo_path("processed") / "model_report.json").read_text(encoding="utf-8"))


def test_forecast_beats_every_baseline_and_covers(report: dict) -> None:
    for name, bucket in report["forecast"]["buckets"].items():
        ai = bucket["ai_recovered"]
        for baseline in ("seasonal_naive", "moving_average_28d", "ets"):
            assert ai["wape"] < bucket[baseline]["wape"], (name, baseline)
        assert 0.75 <= ai["coverage_p10_p90"] <= 0.85, name
    first = report["forecast"]["buckets"]["1-7"]
    assert first["ai_trained_on_recorded_sales"]["wpe"] < first["ai_recovered"]["wpe"] - 0.2


def test_recovery_removes_most_of_the_censoring_bias(report: dict) -> None:
    test = report["recovery"]["profile"]["test"]
    assert test["naive_daily_wpe"] < -0.25 and abs(test["daily_wpe"]) < 0.03
    assert report["recovery"]["chosen"] == "profile"


def test_ablation_ranks_stock_status_first() -> None:
    doc = json.loads((repo_path("web_data") / "ablation.json").read_text(encoding="utf-8"))
    assert doc["isFixture"] is False
    top = max(doc["groups"], key=lambda g: g["deltaWape"])
    assert top["id"] == "stock-status" and top["deltaWape"] > 0.05


def test_store_level_spike_detector_meets_the_plan_targets(report: dict) -> None:
    store = report["spikes"]["store"]["test"]
    assert store["median_delay_hours"] <= 4 and store["false_alarms_per_store_week"] <= 1.0

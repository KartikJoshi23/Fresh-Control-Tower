"""Demand recovery (P3-01) and the real-data masking test (P3-02): hand-worked examples.

The comments give the arithmetic. The real-data run itself is marked `data` (it needs Datasets/).
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from freshpipe import masking, recover
from freshpipe.config import repo_path

FLAT = np.full(24, 1 / 24)


def cube(days: int, per_hour: float = 2.0) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """One series, flat demand of `per_hour` units every hour, fully in stock, flat profile."""
    sales = np.full((1, days, 24), per_hour)
    return sales, np.zeros(sales.shape, dtype=bool), np.broadcast_to(FLAT, sales.shape)


def test_profile_recovery_worked_example() -> None:
    # In stock 00:00-11:59 selling 2 an hour (24 units, half the profile mass) -> level 24 / 0.5 = 48.
    # Hours 12-23 are out of stock; hour 12 still sold 1 (a transition hour). Each hidden hour gets
    # 48 / 24 = 2, and hour 12 keeps max(1, 2) = 2. Recovered day = 24 + 12 x 2 = 48.
    sales, oos, prof = cube(1)
    sales[0, 0, 12:] = 0.0
    sales[0, 0, 12] = 1.0
    oos[0, 0, 12:] = True
    rec = recover.profile_recovery(sales, oos, prof, alpha=0.0)
    assert rec.daily[0, 0] == pytest.approx(48.0)
    assert rec.hourly[0, 0, 12] == pytest.approx(2.0) and np.allclose(rec.hourly[0, 0, :12], 2.0)


def test_prior_fills_empty_days_and_blends_with_alpha() -> None:
    sales, oos, prof = cube(8)
    # Day 7 has no in-stock hour: with alpha = 0 it takes the same-weekday prior (day 0: 48 units).
    sales[0, 7] = 0.0
    oos[0, 7] = True
    assert recover.profile_recovery(sales, oos, prof, alpha=0.0).daily[0, 7] == pytest.approx(48.0)
    # Day 7 half in stock selling 1 an hour (12 units, mass 0.5), alpha = 0.1:
    # level = (12 + 0.1 x 48) / (0.5 + 0.1) = 28 -> 12 hidden hours x 28/24 = 14 -> 12 + 14 = 26.
    sales[0, 7, :12] = 1.0
    oos[0, 7, :12] = False
    assert recover.profile_recovery(sales, oos, prof, alpha=0.1).daily[0, 7] == pytest.approx(26.0)


def test_recovery_never_reduces_recorded_sales() -> None:
    rng = np.random.default_rng(0)
    sales = rng.poisson(3.0, (5, 30, 24)).astype(float)
    oos = rng.random(sales.shape) < 0.3
    rec = recover.profile_recovery(sales, oos, np.broadcast_to(FLAT, sales.shape))
    assert np.all(rec.hourly >= sales - 1e-9)
    assert np.array_equal(rec.hourly[~oos], sales[~oos])          # in-stock hours are kept as recorded


def test_profiles_shrink_thin_series_to_their_category() -> None:
    # Series 0 sells only at 09:00; series 1 (same category) never had a fully in-stock day.
    sales = np.zeros((2, 10, 24))
    sales[0, :, 9] = 10.0
    oos = np.zeros(sales.shape, dtype=bool)
    oos[1, :, 0] = True
    special = np.zeros(10, dtype=bool)
    special[5:] = True
    prof = recover.estimate_profiles(sales, oos, np.array([0, 0]), special, np.ones(10, dtype=bool),
                                     shrink_units=50.0)
    # Series 0: 50 units at 09:00 on normal days + 50 pseudo-units of the category profile (also all 09:00).
    assert prof["normal"][0, 9] == pytest.approx(1.0)
    assert prof["normal"][1, 9] == pytest.approx(1.0)               # borrowed entirely from the category
    assert np.allclose(prof["normal"].sum(axis=1), 1.0) and np.allclose(prof["special"].sum(axis=1), 1.0)


def test_metrics_worked_example() -> None:
    assert recover.wape(np.array([8.0, 12.0]), np.array([10.0, 10.0])) == pytest.approx(0.2)
    assert recover.wpe(np.array([8.0, 10.0]), np.array([10.0, 10.0])) == pytest.approx(-0.1)


def test_evaluate_scores_the_hidden_part() -> None:
    truth = np.full((1, 1, 24), 2.0)
    sales, oos, _ = cube(1)
    oos[0, 0, 12:] = True
    sales[0, 0, 12:] = 0.0
    rec = recover.Recovery("test", np.zeros((1, 1)), np.where(oos, 3.0, sales))   # 3 per hidden hour vs 2
    out = recover.evaluate(rec, truth, sales, oos)
    assert out["hidden_wape"] == pytest.approx(0.5) and out["hidden_wpe"] == pytest.approx(0.5)
    assert out["naive_daily_wpe"] == pytest.approx(-0.5) and out["stockout_series_days"] == 1


# --- Masking test helpers on a small hand-built cube ------------------------------------------------------------

def fake_cube(n: int = 4, d: int = 90) -> masking.FrnCube:
    rng = np.random.default_rng(3)
    profile = np.r_[np.zeros(6), np.full(16, 1 / 16), np.zeros(2)]
    sales = (np.full((n, d, 1), 16.0) * profile).astype(np.float32)
    oos = np.zeros(sales.shape, dtype=bool)
    stock_days = rng.random((n, d)) < 0.4                         # some real partial stockouts from 17:00
    oos[stock_days, 17:] = True
    sales[oos] = 0.0
    keys = pd.DataFrame({"store_id": np.arange(n), "product_id": 1, "first_category_id": 5})
    daily = {k: np.zeros((n, d)) for k in ("discount", "holiday_flag", "activity_flag", "precpt", "avg_temperature")}
    daily["discount"][:] = 1.0
    return masking.FrnCube(keys, pd.date_range("2024-03-28", periods=d), sales, oos, daily)


def test_first_stockout_hour_distribution() -> None:
    dist = masking.first_hour_distribution(fake_cube().oos)
    assert dist.sum() == pytest.approx(1.0) and dist[:7].sum() == 0.0 and dist[17] == pytest.approx(1.0)


def test_mask_hides_hours_from_the_first_stockout_on_in_stock_days_only() -> None:
    c = fake_cube()
    window = np.arange(90) >= 60
    masked, s_idx, t_idx = masking._mask(c, window, np.random.default_rng(0))
    assert np.all(t_idx >= 60)
    assert not np.any(masked & c.oos)                              # only fully in-stock days are masked
    assert np.all(masked[s_idx, t_idx, 17:]) and not np.any(masked[s_idx, t_idx, :17])


def test_masking_recovers_a_perfectly_regular_series() -> None:
    # Demand is identical every day and follows the profile exactly, so recovery is exact and so is the oracle.
    result = masking.masking_test(fake_cube(), seed=1)
    assert result["hidden_wape"] == pytest.approx(0.0, abs=1e-6) and result["oracle_hidden_wape"] == pytest.approx(0.0, abs=1e-6)


def test_forecast_bias_test_runs_and_is_unbiased_without_censoring() -> None:
    train = fake_cube()
    train.oos[:] = False
    train.sales[:] = train.sales.max(axis=(0, 1), keepdims=True)  # no stockouts: raw = recovered
    evaluation = masking.FrnCube(train.keys, pd.date_range("2024-06-26", periods=7), train.sales[:, :7].copy(),
                                 np.zeros((4, 7, 24), dtype=bool), {k: v[:, :7] for k, v in train.daily.items()})
    out = masking.forecast_bias_test(train, evaluation, seed=1)
    assert out["recovered_vs_raw_train_volume"] == pytest.approx(0.0, abs=1e-6)
    assert abs(out["raw_sales"]["wpe_in_stock_hours"]) < 0.02 and abs(out["recovered"]["wpe_in_stock_hours"]) < 0.02


# --- Committed artefact (generated locally from the raw data) ---------------------------------------------------

def test_realdata_artefact_is_not_a_fixture_and_shows_the_bias_reversal() -> None:
    doc = json.loads((repo_path("web_data") / "realdata.json").read_text(encoding="utf-8"))
    entry = next(e for e in doc["entries"] if e["datasetId"] == "frn-50k")
    m = entry["masking"]
    assert doc["isFixture"] is False and doc["provenance"] == "REAL"
    assert m["naiveForecastWpe"] < -0.05 < m["recoveredForecastWpe"]     # raw sales under-forecast
    assert abs(m["recoveredForecastWpe"]) < 0.02 and abs(m["recoveryWpe"]) < 0.05


@pytest.mark.data
def test_masking_test_reproduces_the_committed_numbers() -> None:
    doc = json.loads((repo_path("web_data") / "realdata.json").read_text(encoding="utf-8"))
    m = next(e for e in doc["entries"] if e["datasetId"] == "frn-50k")["masking"]
    result = masking.masking_test(masking.load_cube(repo_path("frn50k_train")), seed=2026)
    assert (result["hidden_wape"], result["hidden_wpe"]) == (m["recoveryWape"], m["recoveryWpe"])


def test_synthetic_recovery_reproduces_the_committed_report() -> None:
    # Regenerates the world and the P0 run from the seed (about 10 s), then re-runs profile recovery.
    from freshpipe import generate, simulate
    from freshpipe.config import load_config

    config = load_config()
    world = generate.generate_world(config)
    run = simulate.simulate(world, simulate.BaselinePolicy.from_config(config), config=config)
    h = run.horizon
    _, report = recover.recover_p0(world, run.sales_h[:, h], run.oos_h[:, h], config, with_ml=False)
    committed = json.loads((repo_path("processed") / "model_report.json").read_text(encoding="utf-8"))["recovery"]
    assert report["alpha"] == committed["alpha"]
    assert report["profile"] == committed["profile"]
    assert report["oracle_validation"] == committed["oracle_validation"]

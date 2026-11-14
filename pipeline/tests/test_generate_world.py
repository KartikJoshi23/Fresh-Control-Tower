"""Synthetic UAE world (task P2-01): catalogue integrity, worked examples, anchors and reproducibility.

The full world is generated once per module (about 2 s), from the committed calibration.json and the
committed data/external files, so these tests also run in CI.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd
import pytest

from freshpipe import generate, world
from freshpipe.config import load_config, repo_path


@pytest.fixture(scope="module")
def config() -> dict:
    return load_config()


@pytest.fixture(scope="module")
def calibration() -> dict:
    return json.loads((repo_path("processed") / "calibration.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def built(config: dict, calibration: dict) -> generate.World:
    return generate.generate_world(config, calibration)


# --- Catalogue and supplier terms ----------------------------------------------------------------------------

def test_catalogue_agrees_with_the_config(config: dict) -> None:
    world.validate_world(config["world"])
    assert (len(world.STORES), len(world.SKUS), len(world.CATEGORIES)) == (8, 40, 9)
    with pytest.raises(ValueError, match="disagree"):
        world.validate_world(dict(config["world"], skus=39))


def test_only_sea_and_air_suppliers_have_disruption_terms() -> None:
    for supplier in world.suppliers():
        if supplier.mode in ("sea", "air"):
            assert supplier.disrupted is not None, supplier.id
            # A disruption never shortens the lead time or improves reliability.
            assert supplier.disrupted.lead_time_days >= supplier.normal.lead_time_days
            assert supplier.disrupted.fill_rate < supplier.normal.fill_rate
        else:
            assert supplier.disrupted is None, supplier.id
    assert {s.id for s in world.suppliers() if s.via_hormuz} == {"sup-sea-import", "sup-sea-europe"}


def test_supply_terms_worked_example() -> None:
    terms = world.SupplyTerms(2, p_late=0.10, p_late2=0.05, p_miss=0.10, p_short=0.50)
    # Fill rate = (1 - 0.10) x (1 - 0.50 x (1 - mean short fill 0.70)) = 0.9 x 0.85 = 0.765.
    assert terms.fill_rate == pytest.approx(0.765)
    # Delay: 2 days w.p. 0.85, 3 w.p. 0.10, 4 w.p. 0.05 -> mean 2.2; E[X^2] = 5.1; sd = sqrt(5.1 - 4.84).
    mean, sd = terms.delay_moments()
    assert mean == pytest.approx(2.2) and sd == pytest.approx(math.sqrt(0.26))
    with pytest.raises(ValueError):
        world.SupplyTerms(0, 0, 0, 0, 0)


def test_lognormal_fit_reproduces_the_quantiles() -> None:
    mu, sigma = world.lognormal_from_quantiles(2.0, 4.0, 8.0)
    assert mu == pytest.approx(math.log(4.0))
    assert math.exp(mu - world.Z90 * sigma) == pytest.approx(2.0)
    assert math.exp(mu + world.Z90 * sigma) == pytest.approx(8.0)


def test_unit_costs_come_from_real_markups(calibration: dict) -> None:
    markups = world.markups(calibration, 2026)
    overall = calibration["veg"]["markup_retail_over_wholesale"]["overall"]
    assert world.unit_cost(world.SKUS[0], 1.662) == 3.91          # 6.50 / 1.662 = 3.9109 -> 3.91 AED
    for sku in world.SKUS:
        q = (calibration["veg"]["markup_retail_over_wholesale"]["by_category"][sku.reference]
             if sku.reference else overall)
        assert q["p10"] / 1.1 - 1e-9 <= markups[sku.id] <= q["p90"] * 1.1 + 1e-9
        assert 0 < world.unit_cost(sku, markups[sku.id]) < sku.price_aed
    assert markups == world.markups(calibration, 2026)             # seeded: the same seed, the same draw


def test_catalog_json_is_regenerated_from_the_code(calibration: dict, config: dict) -> None:
    committed = json.loads((repo_path("web_data") / "catalog.json").read_text(encoding="utf-8"))
    body = world.catalog_body(calibration, config["seed"])
    for key in ("stores", "categories", "skus", "heroSeries"):
        assert committed[key] == body[key], key
    assert committed["isFixture"] is False and committed["provenance"] == "CALIBRATED_SYNTHETIC"
    assert len(body["heroSeries"]) == 40


def test_rng_streams_are_independent_and_reproducible() -> None:
    a1 = world.rng_for(7, "alpha").random(5)
    assert np.array_equal(a1, world.rng_for(7, "alpha").random(5))
    assert not np.array_equal(a1, world.rng_for(7, "beta").random(5))
    assert not np.array_equal(a1, world.rng_for(7, "alpha", 1).random(5))
    assert not np.array_equal(a1, world.rng_for(8, "alpha").random(5))


# --- Deterministic components ----------------------------------------------------------------------------------

def test_festival_shapes(calibration: dict) -> None:
    ramp = generate.pre_ramp(calibration)
    assert ramp.shape == (14,) and ramp[-1] == 1.0 and ramp.min() >= 0.0
    assert np.allclose(generate.holiday_dip(calibration, 0.0), 1.0)
    real = dict(zip(calibration["frnlt"]["spring_festival_shape"]["offsets"],
                    calibration["frnlt"]["spring_festival_shape"]["mean_index"]))
    full = generate.holiday_dip(calibration, 1.0)
    assert np.allclose(full, [real[o] for o in range(7)])
    assert np.allclose(generate.holiday_dip(calibration, 0.5), 1 - 0.5 * (1 - full))


def test_promotion_response_worked_example(calibration: dict) -> None:
    m = calibration["frnlt"]["effects_log_sales"]["multipliers"]
    out = generate.promo_multiplier(np.array([0.0, 0.10, 0.20]), calibration)
    assert out[0] == 1.0
    assert out[1] == pytest.approx(m["per_10pct_discount"] * m["activity_day"])
    assert out[2] == pytest.approx(m["per_10pct_discount"] ** 2 * m["activity_day"])


def test_promotion_calendar(config: dict) -> None:
    params = config["world"]["promotions"]
    dates, _ = generate.day_range(config)
    depth = generate.promotions(dates, params, config["seed"])
    assert 0.2 <= (depth > 0).mean() <= 0.4                        # about 30% of days (FreshRetailNet: 39-52%)
    assert set(np.unique(depth)) <= {0.0, *params["depths"]}
    for row in depth:                                               # every complete episode lasts 3-7 days
        on = np.r_[0, (row > 0).astype(int), 0]
        starts, ends = np.flatnonzero(np.diff(on) == 1), np.flatnonzero(np.diff(on) == -1)
        lengths = (ends - starts)[:-1] if ends[-1] == row.size else ends - starts
        assert lengths.min() >= params["min_days"] and lengths.max() <= params["max_days"]


def test_weather_multiplier_is_bounded(calibration: dict, config: dict) -> None:
    dates, warmup = generate.day_range(config)
    out = generate.weather_multiplier(dates, calibration)
    m = calibration["frnlt"]["effects_log_sales"]["multipliers"]
    assert out.shape == (3, len(dates))
    assert np.all(out[:, :warmup] == 1.0)                          # no weather data before the horizon
    lo = m["per_degree_c"] ** -generate.TEMP_ANOMALY_LIMIT_C
    hi = m["per_degree_c"] ** generate.TEMP_ANOMALY_LIMIT_C * m["per_10mm_precipitation"] ** 2
    assert out.min() >= lo - 1e-9 and out.max() <= hi + 1e-9


# --- The generated world ---------------------------------------------------------------------------------------

def test_world_shape_and_horizon(built: generate.World, config: dict) -> None:
    n_days = (pd.Timestamp(config["horizon"]["end"]) - pd.Timestamp(config["horizon"]["start"])).days + 1
    assert built.demand_h.shape == (320, n_days + 56, 24)
    assert str(built.dates[built.n_warmup].date()) == config["horizon"]["start"]
    assert built.demand_h.min() >= 0 and built.demand_h.dtype == np.int32


def test_anchors_are_met(built: generate.World, config: dict) -> None:
    fest = config["world"]["festivals"]
    assert built.params["ramadan_share_achieved"] == pytest.approx(fest["ramadan_share_target"], abs=0.005)
    assert built.params["ramadan_2026_yoy_achieved"] == pytest.approx(
        config["world"]["stockpiling_2026"]["ramadan_yoy_target"], abs=0.002)
    assert built.params["ramadan_share_years"] == [2023, 2024, 2025]


def test_daily_demand_is_unbiased_around_its_mean(built: generate.World) -> None:
    h = built.horizon
    mean = (built.expected[:, h].astype(float) * built.multiplier[:, h]).sum()
    assert built.demand[:, h].sum() / mean == pytest.approx(1.0, abs=0.01)   # gamma-Poisson keeps the mean


def test_intraday_split_follows_the_calibrated_profile(built: generate.World, calibration: dict) -> None:
    normal_days = (built.day_labels["ramadan_day"].to_numpy() == 0)
    normal_days[: built.n_warmup] = False
    shares = built.demand_h[:, normal_days].sum(axis=(0, 1))
    profile = np.asarray(calibration["uae"]["intraday_profile_normal"]["values"], dtype=float)
    assert np.abs(shares / shares.sum() - profile / profile.sum()).max() < 0.005


def test_calendar_events_land_on_their_dates(built: generate.World) -> None:
    labels = built.day_labels.set_index("date")
    assert labels.loc["2026-03-01", "event"] == "ramadan" and labels.loc["2026-03-01", "ramadan_day"] > 0
    kinds = built.event_kind[:, (built.dates >= "2026-03-01") & (built.dates <= "2026-03-07")]
    assert np.all(kinds == generate.EVENT_STOCKPILING)
    assert not np.any(built.event_kind[:, built.dates < "2026-03-01"] == generate.EVENT_STOCKPILING)


def test_same_seed_same_world_and_a_new_seed_changes_it(built: generate.World, config: dict,
                                                       calibration: dict) -> None:
    again = generate.generate_world(config, calibration)
    assert generate.checksum(again.demand_h) == generate.checksum(built.demand_h)
    other = generate.generate_world(config, calibration, seed=42)
    assert generate.checksum(other.demand_h) != generate.checksum(built.demand_h)


def test_save_and_load_round_trip(built: generate.World, tmp_path) -> None:
    generate.save_world(built, tmp_path)
    loaded = generate.load_world(tmp_path)
    assert np.array_equal(loaded.demand_h, built.demand_h)
    assert np.array_equal(loaded.expected, built.expected)
    assert loaded.dates.equals(built.dates) and loaded.n_warmup == built.n_warmup
    manifest = json.loads((tmp_path / "world_manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["series"]) == 320 and manifest["seed"] == built.seed

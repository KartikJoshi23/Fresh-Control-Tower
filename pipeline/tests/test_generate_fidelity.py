"""Fidelity report (task P2-03): the full world under P0 meets every band, and the committed report reproduces.

Builds the full world and the hourly P0 run once (about 10 s). Everything comes from committed files,
so this runs in CI as well.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from freshpipe import fidelity, generate, simulate
from freshpipe.config import load_config, repo_path


@pytest.fixture(scope="module")
def calibration() -> dict:
    return json.loads((repo_path("processed") / "calibration.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def world_and_run(calibration: dict) -> tuple[generate.World, simulate.RunResult]:
    config = load_config()
    world = generate.generate_world(config, calibration)
    run = simulate.simulate(world, simulate.BaselinePolicy.from_config(config), config=config)
    return world, run


@pytest.fixture(scope="module")
def report(world_and_run, calibration: dict) -> dict:
    return fidelity.build_report(*world_and_run, calibration)


def test_every_band_and_anchor_passes(report: dict) -> None:
    failed = [c["id"] for c in report["checks"] if not c["pass"]] + [a["id"] for a in report["anchors"] if not a["pass"]]
    assert failed == []
    assert report["summary"] == {"checks": 12, "passed": 12, "allPassed": True, "anchors": 2, "anchorsPassed": 2}


def test_committed_report_reproduces_from_the_seed(report: dict) -> None:
    committed = json.loads((repo_path("processed") / "fidelity_report.json").read_text(encoding="utf-8"))
    fresh = json.loads(json.dumps(report))                     # same float handling as the written file
    committed.pop("generatedAt")
    fresh.pop("generatedAt")
    assert fresh == committed


def test_spoilage_matches_the_real_vegetable_loss_rates(report: dict, calibration: dict) -> None:
    targets = fidelity.loss_targets(calibration)
    spoil = report["diagnostics"]["spoilage_pct_by_category"]
    for cat in fidelity.VEGETABLE_CATEGORIES:
        assert spoil[cat]["total"] == pytest.approx(targets[cat], abs=1.0), cat


def test_p0_history_is_censored(world_and_run) -> None:
    world, run = world_and_run
    daily = simulate.daily_table(run, world)
    assert np.array_equal(daily["recorded_sales"] + daily["lost_sales"], daily["true_demand"])
    assert (daily["lost_sales"] >= 0).all() and daily["lost_sales"].sum() > 0
    # Transition hours: some hours both sell and end out of stock (the FreshRetailNet flag semantics).
    h = run.horizon
    assert np.any(run.oos_h[:, h] & (run.sales_h[:, h] > 0))
    # The orders log only references real series and suppliers, with non-negative quantities.
    assert run.orders["series"].between(0, world.n_series - 1).all() and (run.orders["qty"] > 0).all()


def test_band_check_helper() -> None:
    inside = fidelity._band_check("x", "x", 0.3, [0.2, 0.4], "emergent", None, "m")
    assert inside["pass"] and inside["band"] == {"min": 0.2, "max": 0.4}
    capped = fidelity._band_check("y", "y", 0.06, 0.05, "emergent", None, "m", upper_only=True)
    assert not capped["pass"] and capped["band"] == {"max": 0.05}


def test_spoilage_and_window_arithmetic() -> None:
    # 100 units received, 10 culled and 5 expired: 10% handling + 5% expiry = 15% (kg per unit cancels).
    daily = pd.DataFrame({"sku_id": ["lettuce-romaine"], "receipts": [100], "handling_loss": [10], "expired": [5]})
    row = fidelity.spoilage_by_category(daily).loc["leafy-greens"]
    assert (row.handling_pct, row.expiry_pct, row.total_pct) == pytest.approx((10.0, 5.0, 15.0))
    # Three days with 0, 8 and 16 stockout hours: availability 1 - 8/16 = 0.5; fill 15/30; 2 of 3 days hit.
    frame = pd.DataFrame({"date": pd.to_datetime(["2026-01-01", "2026-01-02", "2026-01-03"]), "sku_id": "a",
                          "stockout_hours": [0, 8, 16], "recorded_sales": [10, 5, 0], "true_demand": [10, 10, 10]})
    assert fidelity.window_kpis(frame, "2026-01-01", "2026-01-03") == {
        "availability": 0.5, "fill_rate": 0.5, "stockout_day_share": 0.6667}

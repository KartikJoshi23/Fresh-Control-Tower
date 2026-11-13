"""Golden checks: the committed Part 1 outputs reproduce the Phase 3 inspection (docs/03-data-inspection.md).

These read the committed data/processed files, so they also run in CI. They catch a regeneration
that silently changed a number the plan and the report rely on.
"""

from __future__ import annotations

import json

import pytest

from freshpipe.config import repo_path


@pytest.fixture(scope="module")
def report() -> dict:
    return json.loads((repo_path("processed") / "cleaning_report.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def calibration() -> dict:
    return json.loads((repo_path("processed") / "calibration.json").read_text(encoding="utf-8"))


def test_cleaning_counts_match_the_inspection(report: dict) -> None:
    frn50k, frnlt, veg = report["frn50k"], report["frnlt"], report["veg"]
    assert frn50k["rows"] == 4_500_000 and frnlt["rows"] == 7_869_549
    assert frn50k["stock_flag_mismatch_rows"] == 0 == frnlt["stock_flag_mismatch_rows"]  # C1 on every row
    assert (frn50k["all_day_outages"], frnlt["all_day_outages"]) == (181_791, 429_038)     # C3
    assert (frn50k["discount_zero_to_missing"], frn50k["discount_capped_at_one"]) == (16_039, 34)  # C4
    assert (frn50k["series"], frn50k["series_with_gaps"]) == (50_000, 0)
    assert (frnlt["series"], frnlt["series_with_gaps"]) == (22_939, 8_022)                  # C7
    assert (veg["return_lines"], veg["closure_days"], veg["duplicate_item_names"]) == (461, 10, 4)
    assert veg["item_days"] == 46_599 and veg["item_days_without_wholesale"] == 0


@pytest.mark.parametrize(("dataset", "oos_hours", "days_with_stockout", "all_day", "h07", "h20", "censoring"), [
    ("frn50k", 0.1988, 0.4427, 0.0404, 0.0096, 0.3617, 1.464),
    ("frnlt", 0.2216, 0.4820, 0.0545, 0.0141, 0.3874, 1.223),
])
def test_stockout_statistics_match_the_inspection(calibration: dict, dataset: str, oos_hours: float,
                                                  days_with_stockout: float, all_day: float, h07: float,
                                                  h20: float, censoring: float) -> None:
    stockouts = calibration[dataset]["stockouts"]
    by_hour = stockouts["stockout_share_by_hour_excl_all_day"]
    assert stockouts["oos_hours_share"] == pytest.approx(oos_hours, abs=5e-4)
    assert stockouts["days_with_stockout_share"] == pytest.approx(days_with_stockout, abs=5e-4)
    assert stockouts["all_day_outage_share"] == pytest.approx(all_day, abs=5e-4)
    assert (by_hour[7], by_hour[20]) == (pytest.approx(h07, abs=5e-4), pytest.approx(h20, abs=5e-4))
    assert calibration[dataset]["censoring"]["ratio"] == pytest.approx(censoring, abs=0.005)


def test_vegetable_economics_and_spikes_match_the_inspection(calibration: dict) -> None:
    veg = calibration["veg"]
    # The markup now uses the revenue-weighted price after capping outliers (inspection: median price), hence the tolerance.
    assert veg["markup_retail_over_wholesale"]["overall"]["p50"] == pytest.approx(1.662, abs=0.02)
    assert veg["spoilage"]["kg_weighted_pct_overall"] == pytest.approx(9.9, abs=0.05)
    spikes = veg["spikes"]["store_daily_vs_28d_median"]
    assert spikes["p95"] == pytest.approx(1.642, abs=0.01) and spikes["p99"] == pytest.approx(2.075, abs=0.01)
    assert spikes["max_date"] == "2022-11-19"
    assert 1.79 <= veg["lunar_new_year_shape"]["pre_week_index"] <= 2.52  # inspection: 1.79–2.52 by year


def test_effects_have_plausible_signs(calibration: dict) -> None:
    for dataset in ("frn50k", "frnlt"):
        multipliers = calibration[dataset]["effects_log_sales"]["multipliers"]
        assert multipliers["per_10pct_discount"] > 1.0   # deeper discounts sell more
        assert multipliers["weekend"] > 1.0              # weekends sell more


def test_uae_profiles_are_distributions_and_assumptions_are_flagged(calibration: dict) -> None:
    uae = calibration["uae"]
    for key in ("intraday_profile_normal", "intraday_profile_ramadan"):
        values = uae[key]["values"]
        assert len(values) == 24 and sum(values) == pytest.approx(1.0, abs=1e-3)
    assert uae["intraday_profile_ramadan"]["assumption"] is True
    assert 1.15 <= max(uae["weekly"]["index_mon_to_sun"]) <= 1.30   # weekend_day_index band

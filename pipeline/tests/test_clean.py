"""Unit tests for cleaning rules C1–C14 (docs/03-data-inspection.md §6), on small hand-built inputs."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from freshpipe import clean


def _row(stockout_from: int | None, sales_per_hour: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    """One store-day: sales in every trading hour until a stockout starting at `stockout_from`."""
    status = np.zeros(24, dtype=np.int64)
    sales = np.zeros(24, dtype=np.float32)
    sales[6:22] = sales_per_hour
    if stockout_from is not None:
        status[stockout_from:22] = 1
        sales[stockout_from + 1:22] = 0.0  # the first stockout hour keeps some sales (transition hour)
    return status, sales


def test_c1_one_means_out_of_stock_and_counts_trading_hours() -> None:
    status, _ = _row(stockout_from=17)
    oos = clean.decode_stock_flags(status[None, :])
    assert oos.dtype == bool
    assert oos[0, 17] and not oos[0, 16]
    assert clean.stockout_hours(oos)[0] == 5  # 17:00–21:59


def test_c1_rejects_values_other_than_zero_and_one() -> None:
    with pytest.raises(ValueError):
        clean.decode_stock_flags(np.full((1, 24), 2))


def test_first_stockout_hour() -> None:
    rows = np.zeros((3, 24), dtype=bool)
    rows[1, 17:22] = True
    rows[2, 23] = True  # outside trading hours does not count
    assert clean.first_stockout_hour(rows).tolist() == [-1, 17, -1]


def test_c2_transition_hours_are_stockout_hours_with_sales() -> None:
    status, sales = _row(stockout_from=17)
    oos = clean.decode_stock_flags(status[None, :])
    transition = clean.transition_hours(sales[None, :], oos)
    assert transition.sum() == 1 and transition[0, 17]


def test_c3_all_day_outage() -> None:
    assert clean.all_day_outage(np.array([16, 15, 0])).tolist() == [True, False, False]


def test_c4_discount_zero_becomes_missing_and_above_one_is_capped() -> None:
    cleaned, n_zero, n_above = clean.clean_discount(np.array([0.0, 0.9, 1.0, 1.088]))
    assert np.isnan(cleaned[0]) and cleaned[1:].tolist() == [0.9, 1.0, 1.0]
    assert (n_zero, n_above) == (1, 1)


def test_c5_holiday_flag_split() -> None:
    # 4 Apr 2024 (Thu, Qingming), 6 Apr (Sat, flagged), 7 Apr (Sun make-up workday, not flagged), 8 Apr (Mon)
    dates = pd.to_datetime(["2024-04-04", "2024-04-06", "2024-04-07", "2024-04-08"])
    parts = clean.split_holiday_flag(dates, np.array([1, 1, 0, 0]))
    assert parts["is_weekend"].tolist() == [False, True, True, False]
    assert parts["is_public_holiday"].tolist() == [True, False, False, False]
    assert parts["flagged_weekend_workday"].tolist() == [False, False, True, False]


def test_c7_gaps_are_counted_and_reindexing_marks_missing_not_zero() -> None:
    daily = pd.DataFrame({"store_id": 1, "product_id": 2,
                          "dt": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-04"]),
                          "sale_amount": [1.0, 2.0, 3.0]})
    assert clean.series_gaps(daily)["missing_days"].tolist() == [1]
    full = clean.reindex_daily(daily)
    inserted = full.loc[full["is_missing_day"]]
    assert len(full) == 4 and len(inserted) == 1
    assert inserted["sale_amount"].isna().all()


def test_c9_category_names_lose_non_breaking_spaces() -> None:
    names = pd.Series(["Flower/Leaf Vegetables", " Capsicum "])
    assert clean.normalise_category_names(names).tolist() == ["Flower/Leaf Vegetables", "Capsicum"]


def test_c10_hours_parse_both_formats_and_bad_stamps_become_nan() -> None:
    hours = clean.parse_hour(pd.Series(["09:15:07.924", "21:05:00", "not a time"]))
    assert hours.iloc[:2].tolist() == [9, 21] and np.isnan(hours.iloc[2])


def test_c11_extreme_lines_are_capped_but_returns_are_untouched() -> None:
    tx = pd.DataFrame({"item": ["a"] * 1001 + ["a"], "qty_kg": [1.0] * 1000 + [160.0, -0.5]})
    capped, n = clean.cap_line_quantities(tx)
    assert n == 1 and capped.iloc[1000] < 160.0 and capped.iloc[-1] == -0.5


def test_c12_days_without_transactions_are_closures() -> None:
    daily = pd.Series([10.0, 12.0], index=pd.to_datetime(["2023-01-20", "2023-01-22"]))
    marked = clean.mark_closures(daily)
    assert marked["closed"].tolist() == [False, True, False]


def test_c13_sales_below_wholesale_are_clearance() -> None:
    item_day = pd.DataFrame({"avg_price": [5.0, 3.0], "wholesale": [3.0, 4.0]})
    assert clean.flag_clearance(item_day).tolist() == [False, True]


def test_c14_provenance_is_added_without_touching_the_input() -> None:
    frame = pd.DataFrame({"x": [1]})
    tagged = clean.with_provenance(frame, "REAL", "yapwh2023-vegetables")
    assert tagged[["provenance", "source_id"]].iloc[0].tolist() == ["REAL", "yapwh2023-vegetables"]
    assert list(frame.columns) == ["x"]


def test_hourly_accumulator_profiles_censoring_and_outages() -> None:
    in_stock = _row(None, 1.0)
    sold_out_later = _row(15, 2.0)        # busier day that sells out at 15:00
    all_day = (np.ones(24, dtype=np.int64), np.zeros(24, dtype=np.float32))
    status = np.stack([in_stock[0], sold_out_later[0], all_day[0]])
    sales = np.stack([in_stock[1], sold_out_later[1], all_day[1]])
    oos = clean.decode_stock_flags(status)
    acc = clean.HourlyAccumulator()
    acc.update(sales, oos, clean.stockout_hours(oos), clean.first_stockout_hour(oos))
    summary = acc.summary()
    assert summary["all_day_outage_share"] == pytest.approx(1 / 3, abs=1e-4)
    assert sum(summary["in_stock_profile"]) == pytest.approx(1.0, abs=1e-4)
    assert summary["censoring"]["ratio"] == pytest.approx(2.0)          # morning sales 2 vs 1 per hour
    assert summary["stockout_share_by_hour"][16] == pytest.approx(0.5)  # 1 of 2 non-outage rows

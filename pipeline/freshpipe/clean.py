"""Cleaning rules C1–C14 (docs/03-data-inspection.md §6) and the cleaned tables they produce (P1-01).

Each rule is a small pure function with a unit test. `clean_frn` and `clean_veg` apply the rules
to the raw files and return tidy tables plus a report of how often each rule fired.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .ingest import VegRaw, column, hourly_matrix, iter_frn_batches

TRADING_HOURS = slice(6, 22)  # 06:00–21:59: the window `stock_hour6_22_cnt` counts (16 hours)
N_TRADING_HOURS = 16
MORNING_HOURS = slice(6, 12)  # 06:00–11:59
LATE_STOCKOUT_FROM = 14       # "sold out later" = first stockout at or after 14:00


# --- FreshRetailNet rules -------------------------------------------------------------------------

def decode_stock_flags(status: np.ndarray) -> np.ndarray:
    """C1: FreshRetailNet `hours_stock_status` uses 1 = OUT of stock. Returns a boolean stockout mask."""
    values = np.asarray(status)
    if not np.isin(values, (0, 1)).all():
        raise ValueError("stock status must contain only 0 and 1")
    return values == 1


def stockout_hours(oos: np.ndarray) -> np.ndarray:
    """Number of out-of-stock trading hours (06:00–21:59) per row; equals `stock_hour6_22_cnt`."""
    return oos[:, TRADING_HOURS].sum(axis=1)


def first_stockout_hour(oos: np.ndarray) -> np.ndarray:
    """First out-of-stock trading hour per row (6–21), or -1 if the row never stocked out in trading hours."""
    window = oos[:, TRADING_HOURS]
    has = window.any(axis=1)
    return np.where(has, window.argmax(axis=1) + TRADING_HOURS.start, -1)


def transition_hours(sales: np.ndarray, oos: np.ndarray) -> np.ndarray:
    """C2: hours flagged out of stock that still have sales (stock ran out mid-hour).

    Their sales are a lower bound on demand, so recovery treats them as censored.
    """
    return oos & (sales > 0)


def all_day_outage(stockout_hour_count: np.ndarray) -> np.ndarray:
    """C3: out of stock for all 16 trading hours. Demand is unknown on these days, not zero."""
    return np.asarray(stockout_hour_count) == N_TRADING_HOURS


def clean_discount(discount: np.ndarray) -> tuple[np.ndarray, int, int]:
    """C4: `discount` is the price ratio (1.0 = full price). 0.0 is implausible, so it becomes NaN.
    Values above 1.0 are capped at 1.0. Returns (cleaned, n_zero, n_above_one).
    """
    values = np.asarray(discount, dtype=np.float64).copy()
    zero = values == 0.0
    above = values > 1.0
    values[zero] = np.nan
    values[above] = 1.0
    return values, int(zero.sum()), int(above.sum())


def split_holiday_flag(dates: pd.DatetimeIndex | pd.Series, holiday_flag: np.ndarray) -> dict[str, np.ndarray]:
    """C5: split FreshRetailNet's `holiday_flag` (weekends + Chinese public holidays) into parts.

    Returns `is_weekend` (Saturday/Sunday by date), `is_public_holiday` (flagged on a weekday) and
    `flagged_weekend_workday` (a weekend the data does NOT flag, i.e. a make-up working day).
    """
    weekday = pd.DatetimeIndex(dates).dayofweek.to_numpy()
    flag = np.asarray(holiday_flag).astype(bool)
    is_weekend = weekday >= 5
    return {
        "is_weekend": is_weekend,
        "is_public_holiday": flag & ~is_weekend,
        "flagged_weekend_workday": is_weekend & ~flag,
    }


def series_gaps(daily: pd.DataFrame, keys: tuple[str, ...] = ("store_id", "product_id"),
                date_col: str = "dt") -> pd.DataFrame:
    """C7: per series, the date window and how many days inside it are missing."""
    grouped = daily.groupby(list(keys), observed=True)[date_col]
    span = grouped.agg(["min", "max", "count"])
    span["days_in_window"] = (span["max"] - span["min"]).dt.days + 1
    span["missing_days"] = span["days_in_window"] - span["count"]
    return span


def reindex_daily(series: pd.DataFrame, date_col: str = "dt") -> pd.DataFrame:
    """C7: reindex ONE series to a complete daily grid. Inserted days are marked missing, not zero."""
    frame = series.set_index(date_col).sort_index()
    full = pd.date_range(frame.index.min(), frame.index.max(), freq="D", name=date_col)
    out = frame.reindex(full)
    out["is_missing_day"] = ~out.index.isin(frame.index)
    return out.reset_index()


@dataclass
class HourlyAccumulator:
    """Streams hourly statistics over record batches (the hourly arrays are never all in memory)."""

    rows: int = 0
    all_day_rows: int = 0
    partial_rows: int = 0
    in_stock_days: int = 0
    stockout_days: int = 0
    in_stock_sales_by_hour: np.ndarray = field(default_factory=lambda: np.zeros(24))
    sales_by_hour: np.ndarray = field(default_factory=lambda: np.zeros(24))
    oos_by_hour_partial: np.ndarray = field(default_factory=lambda: np.zeros(24))
    first_stockout_hist: np.ndarray = field(default_factory=lambda: np.zeros(24))
    sales_total: float = 0.0
    sales_in_oos_hours: float = 0.0
    morning_sold_out_later: float = 0.0
    n_sold_out_later: int = 0
    morning_no_stockout: float = 0.0
    n_no_stockout: int = 0

    def update(self, sales: np.ndarray, oos: np.ndarray, oos_count: np.ndarray, first: np.ndarray) -> None:
        all_day = all_day_outage(oos_count)
        partial = ~all_day
        in_stock = oos_count == 0
        self.rows += len(sales)
        self.all_day_rows += int(all_day.sum())
        self.partial_rows += int(partial.sum())
        self.in_stock_days += int(in_stock.sum())
        self.stockout_days += int((oos_count > 0).sum())
        self.in_stock_sales_by_hour += sales[in_stock].sum(axis=0)
        self.sales_by_hour += sales.sum(axis=0)
        self.oos_by_hour_partial += oos[partial].sum(axis=0)
        has_first = (first >= 0) & partial
        self.first_stockout_hist += np.bincount(first[has_first], minlength=24)
        self.sales_total += float(sales.sum())
        self.sales_in_oos_hours += float(sales[oos].sum())
        later = has_first & (first >= LATE_STOCKOUT_FROM)
        self.morning_sold_out_later += float(sales[later][:, MORNING_HOURS].sum())
        self.n_sold_out_later += int(later.sum())
        self.morning_no_stockout += float(sales[in_stock][:, MORNING_HOURS].sum())
        self.n_no_stockout += int(in_stock.sum())

    def summary(self) -> dict[str, object]:
        """JSON-ready statistics (shares and ratios only: FreshRetailNet sales are scaled, rule C6)."""
        morning_later = self.morning_sold_out_later / max(self.n_sold_out_later, 1)
        morning_none = self.morning_no_stockout / max(self.n_no_stockout, 1)
        return {
            "rows": self.rows,
            "in_stock_profile": (self.in_stock_sales_by_hour / self.in_stock_sales_by_hour.sum()).round(5).tolist(),
            "raw_sales_profile": (self.sales_by_hour / self.sales_by_hour.sum()).round(5).tolist(),
            "stockout_share_by_hour": (self.oos_by_hour_partial / max(self.partial_rows, 1)).round(4).tolist(),
            "first_stockout_hour_share": (self.first_stockout_hist / max(self.first_stockout_hist.sum(), 1)).round(4).tolist(),
            "days_fully_in_stock_share": round(self.in_stock_days / self.rows, 4),
            "days_with_stockout_share": round(self.stockout_days / self.rows, 4),
            "all_day_outage_share": round(self.all_day_rows / self.rows, 4),
            "sales_share_in_stockout_hours": round(self.sales_in_oos_hours / self.sales_total, 4),
            "censoring": {
                "morning_sales_sold_out_later": round(morning_later, 4),
                "morning_sales_no_stockout": round(morning_none, 4),
                "ratio": round(morning_later / morning_none, 4),
                "n_sold_out_later": self.n_sold_out_later,
                "n_no_stockout": self.n_no_stockout,
            },
        }


@dataclass(frozen=True)
class FrnClean:
    """A cleaned FreshRetailNet dataset: one row per store-SKU-day plus streamed hourly statistics."""

    dataset_id: str
    daily: pd.DataFrame
    hourly: dict[str, object]
    report: dict[str, int]


def clean_frn(path: Path, dataset_id: str, batch_size: int = 200_000) -> FrnClean:
    """Apply C1–C5 and C8 to a FreshRetailNet file in batches. Returns a compact daily table."""
    acc = HourlyAccumulator()
    report: Counter[str] = Counter()
    parts: list[pd.DataFrame] = []
    for batch in iter_frn_batches(path, batch_size=batch_size):
        sales = hourly_matrix(batch, "hours_sale").astype(np.float32)
        oos = decode_stock_flags(hourly_matrix(batch, "hours_stock_status"))       # C1
        oos_count = column(batch, "stock_hour6_22_cnt")
        report["stock_flag_mismatch_rows"] += int((stockout_hours(oos) != oos_count).sum())
        transition = transition_hours(sales, oos)                                   # C2
        all_day = all_day_outage(oos_count)                                          # C3
        first = first_stockout_hour(oos)
        discount, n_zero, n_above = clean_discount(column(batch, "discount"))       # C4
        dates = pd.to_datetime(column(batch, "dt"))
        holiday = split_holiday_flag(dates, column(batch, "holiday_flag"))          # C5
        acc.update(sales, oos, oos_count, first)
        report["rows"] += batch.num_rows
        report["transition_hours"] += int(transition.sum())
        report["all_day_outages"] += int(all_day.sum())
        report["discount_zero_to_missing"] += n_zero
        report["discount_capped_at_one"] += n_above
        report["flagged_weekend_workdays"] += int(holiday["flagged_weekend_workday"].sum())
        parts.append(pd.DataFrame({                                                  # C8: compact dtypes
            "city_id": column(batch, "city_id").astype(np.int16),
            "store_id": column(batch, "store_id").astype(np.int32),
            "first_category_id": column(batch, "first_category_id").astype(np.int16),
            "product_id": column(batch, "product_id").astype(np.int32),
            "dt": dates,
            "sale_amount": column(batch, "sale_amount").astype(np.float32),
            "discount": discount.astype(np.float32),
            "activity_flag": column(batch, "activity_flag").astype(np.int8),
            "is_weekend": holiday["is_weekend"],
            "is_public_holiday": holiday["is_public_holiday"],
            "avg_temperature": column(batch, "avg_temperature").astype(np.float32),
            "precpt": column(batch, "precpt").astype(np.float32),
            "oos_hours": oos_count.astype(np.int8),
            "all_day_outage": all_day,
            "first_oos_hour": first.astype(np.int8),
            "transition_hours": transition.sum(axis=1).astype(np.int8),
        }))
    daily = pd.concat(parts, ignore_index=True)
    gaps = series_gaps(daily)                                                          # C7
    report["series"] = int(len(gaps))
    report["series_with_gaps"] = int((gaps["missing_days"] > 0).sum())
    report["missing_days_inside_windows"] = int(gaps["missing_days"].sum())
    return FrnClean(dataset_id, daily, acc.summary(), dict(report))


# --- Kaggle vegetable rules -----------------------------------------------------------------------

def normalise_category_names(names: pd.Series) -> pd.Series:
    """C9: replace non-breaking spaces and collapse whitespace. Items are keyed on code, not name."""
    return names.astype(str).str.replace(" ", " ", regex=False).str.split().str.join(" ")


def parse_hour(times: pd.Series) -> pd.Series:
    """C10: hour of day from 'HH:MM:SS.fff' or 'HH:MM:SS'. Unparseable stamps become NaN."""
    text = times.astype(str)
    parsed = pd.to_datetime(text, format="%H:%M:%S.%f", errors="coerce")
    fallback = pd.to_datetime(text, format="%H:%M:%S", errors="coerce")
    return parsed.fillna(fallback).dt.hour


def cap_line_quantities(transactions: pd.DataFrame, quantile: float = 0.999) -> tuple[pd.Series, int]:
    """C11: cap each positive line quantity at its item's `quantile`. Returns (capped qty, n capped)."""
    qty = transactions["qty_kg"]
    positive = qty > 0
    caps = qty[positive].groupby(transactions.loc[positive, "item"]).quantile(quantile)
    limit = transactions["item"].map(caps)
    capped = qty.where(~(positive & (qty > limit)), limit)
    return capped, int((positive & (qty > limit)).sum())


def mark_closures(daily_kg: pd.Series) -> pd.DataFrame:
    """C12: reindex daily totals to every calendar day; days with no transactions are closures, not zero demand."""
    full = pd.date_range(daily_kg.index.min(), daily_kg.index.max(), freq="D")
    out = daily_kg.reindex(full).to_frame("kg")
    out["closed"] = out["kg"].isna()
    out.index.name = "date"
    return out


def flag_clearance(item_day: pd.DataFrame) -> pd.Series:
    """C13: item-days sold below wholesale cost (clearance); excluded from markup calibration."""
    return item_day["avg_price"] < item_day["wholesale"]


def with_provenance(frame: pd.DataFrame, provenance: str, source_id: str) -> pd.DataFrame:
    """C14: tag a derived table with its provenance and source id."""
    out = frame.copy()
    out["provenance"] = provenance
    out["source_id"] = source_id
    return out


@dataclass(frozen=True)
class VegClean:
    """Cleaned Kaggle vegetable tables."""

    items: pd.DataFrame
    transactions: pd.DataFrame
    item_day: pd.DataFrame
    daily: pd.DataFrame
    loss: pd.DataFrame
    report: dict[str, int]


def clean_veg(raw: VegRaw) -> VegClean:
    """Apply C9–C14 to the Kaggle vegetable data."""
    report: Counter[str] = Counter()
    items = raw.items.copy()
    items["category_name"] = normalise_category_names(items["category_name"])                # C9
    report["duplicate_item_names"] = int(items["item_name"].duplicated().sum())

    tx = raw.transactions.copy()
    tx["date"] = pd.to_datetime(tx["date"])
    tx["hour"] = parse_hour(tx["time"])                                                      # C10
    report["unparseable_times"] = int(tx["hour"].isna().sum())
    report["return_lines"] = int((tx["qty_kg"] < 0).sum())
    tx["qty_kg_capped"], report["capped_lines"] = cap_line_quantities(tx)                   # C11
    tx["is_discounted"] = tx["discount"].astype(str).str.strip().str.lower().eq("yes")
    tx["revenue"] = tx["qty_kg_capped"] * tx["price"]

    item_day = (tx.groupby(["item", "date"], as_index=False)
                  .agg(net_kg=("qty_kg_capped", "sum"), revenue=("revenue", "sum"),
                       discount_share=("is_discounted", "mean"), lines=("qty_kg_capped", "size")))
    report["item_days"] = int(len(item_day))                                                 # C10: returns netted
    item_day["avg_price"] = (item_day["revenue"] / item_day["net_kg"]).where(item_day["net_kg"] > 0)
    wholesale = raw.wholesale.assign(date=pd.to_datetime(raw.wholesale["date"]))
    item_day = item_day.merge(wholesale, on=["item", "date"], how="left")
    report["item_days_without_wholesale"] = int(item_day["wholesale"].isna().sum())
    item_day["clearance"] = flag_clearance(item_day)                                         # C13
    report["clearance_item_days"] = int(item_day["clearance"].sum())
    item_day = item_day.merge(items[["item", "category_name"]], on="item", how="left")

    daily = mark_closures(item_day.groupby("date")["net_kg"].sum())                          # C12
    report["closure_days"] = int(daily["closed"].sum())

    loss = raw.loss.merge(items[["item", "category_name"]], on="item", how="left")
    return VegClean(
        items=items,
        transactions=tx,
        item_day=with_provenance(item_day, "REAL", "yapwh2023-vegetables"),                 # C14
        daily=with_provenance(daily, "REAL", "yapwh2023-vegetables"),
        loss=with_provenance(loss, "REAL", "yapwh2023-vegetables"),
        report=dict(report),
    )

"""Readers for the raw datasets (task P1-01).

Columns are always selected **by name** (cleaning rule C7): the two FreshRetailNet releases order
their columns differently and store the stock flags as int64 vs int32. The parquet files are read
in record batches to stay within laptop memory (rule C8).
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

FRN_COLUMNS: tuple[str, ...] = (
    "city_id", "store_id", "first_category_id", "product_id", "dt", "sale_amount", "hours_sale",
    "stock_hour6_22_cnt", "hours_stock_status", "discount", "holiday_flag", "activity_flag",
    "precpt", "avg_temperature",
)

HOURS = 24


def iter_frn_batches(path: Path, columns: tuple[str, ...] = FRN_COLUMNS,
                     batch_size: int = 200_000) -> Iterator[pa.RecordBatch]:
    """Yield record batches of a FreshRetailNet parquet file, with columns selected by name."""
    parquet = pq.ParquetFile(path)
    missing = set(columns) - set(parquet.schema_arrow.names)
    if missing:
        raise KeyError(f"{path.name} is missing columns {sorted(missing)}")
    yield from parquet.iter_batches(batch_size=batch_size, columns=list(columns))


def hourly_matrix(batch: pa.RecordBatch, column: str) -> np.ndarray:
    """Return a list-of-24 column as an (n, 24) array. Raises if any row is not 24 long."""
    values = batch.column(column)
    lengths = pc.list_value_length(values).to_numpy(zero_copy_only=False)
    if not np.all(lengths == HOURS):
        raise ValueError(f"column {column!r} has rows that are not {HOURS} hours long")
    return pc.list_flatten(values).to_numpy(zero_copy_only=False).reshape(batch.num_rows, HOURS)


def column(batch: pa.RecordBatch, name: str) -> np.ndarray:
    """A scalar column of a record batch as a NumPy array."""
    return batch.column(name).to_numpy(zero_copy_only=False)


@dataclass(frozen=True)
class VegRaw:
    """The four Kaggle vegetable files with normalised column names."""

    items: pd.DataFrame        # item, item_name, category_code, category_name
    transactions: pd.DataFrame  # date, time, item, qty_kg, price, sale_or_return, discount
    wholesale: pd.DataFrame     # date, item, wholesale
    loss: pd.DataFrame          # item, item_name, loss_rate_pct


_VEG_FILES = {
    "items": ("annex1.csv", ["item", "item_name", "category_code", "category_name"]),
    "transactions": ("annex2.csv", ["date", "time", "item", "qty_kg", "price", "sale_or_return", "discount"]),
    "wholesale": ("annex3.csv", ["date", "item", "wholesale"]),
    "loss": ("annex4.csv", ["item", "item_name", "loss_rate_pct"]),
}


def read_veg(veg_dir: Path) -> VegRaw:
    """Read annex1–annex4 and rename their columns. The expected column count is checked."""
    frames = {}
    for key, (filename, names) in _VEG_FILES.items():
        frame = pd.read_csv(veg_dir / filename)
        if frame.shape[1] != len(names):
            raise ValueError(f"{filename}: expected {len(names)} columns, found {frame.shape[1]}")
        frame.columns = names
        frames[key] = frame
    return VegRaw(**frames)

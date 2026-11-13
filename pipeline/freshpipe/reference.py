"""Reference factors (task P1-05): transport and food emission factors and shelf lives.

Both tables are curated, sourced CSVs in data/external/:
- emission_factors.csv: UK DESNZ 2025 transport factors (with their factor IDs) and
  Poore and Nemecek (2018) food factors (via Our World in Data);
- shelf_life.csv: USDA FoodKeeper storage times, plus the planning shelf life per category. The
  `basis` column says whether that comes from FoodKeeper or is a stated assumption.
"""

from __future__ import annotations

from functools import lru_cache

import pandas as pd

from .config import repo_path
from .sources import SOURCE_IDS

TRANSPORT_MODES = ("local_truck", "truck", "sea", "air")


def _check_sources(frame: pd.DataFrame, column: str, name: str) -> None:
    for value in frame[column]:
        unknown = set(str(value).split(";")) - SOURCE_IDS
        if unknown:
            raise ValueError(f"{name}: unknown source ids {sorted(unknown)}")


@lru_cache(maxsize=1)
def load_emission_factors() -> pd.DataFrame:
    """Validated emission factors. Raises ValueError on duplicates, non-positive values or unknown sources."""
    frame = pd.read_csv(repo_path("external") / "emission_factors.csv")
    if frame["factor_id"].duplicated().any():
        raise ValueError("emission_factors.csv has duplicate factor ids")
    if (frame["value"] <= 0).any():
        raise ValueError("emission factors must be positive")
    _check_sources(frame, "source_id", "emission_factors.csv")
    modes = set(frame.loc[frame["kind"] == "transport", "applies_to"])
    if modes != set(TRANSPORT_MODES):
        raise ValueError(f"transport factors must cover exactly {TRANSPORT_MODES}")
    return frame


def transport_factor(mode: str) -> float:
    """kg CO2e per tonne.km for a transport mode."""
    rows = load_emission_factors().query("kind == 'transport' and applies_to == @mode")
    if len(rows) != 1:
        raise KeyError(f"no single transport factor for mode {mode!r}")
    return float(rows["value"].iloc[0])


def food_factor(category: str) -> float:
    """kg CO2e per kg of product for a category (categories are ';'-separated in `applies_to`)."""
    food = load_emission_factors().query("kind == 'food'")
    for applies_to, value in zip(food["applies_to"], food["value"]):
        if category in str(applies_to).split(";"):
            return float(value)
    raise KeyError(f"no food emission factor for category {category!r}")


@lru_cache(maxsize=1)
def load_shelf_life() -> pd.DataFrame:
    """Validated shelf-life table. Every category needs exactly one planning value with a stated basis."""
    frame = pd.read_csv(repo_path("external") / "shelf_life.csv")
    planning = frame.dropna(subset=["planning_days"])
    if planning["category_id"].duplicated().any():
        raise ValueError("shelf_life.csv: each category needs exactly one planning value")
    if not planning["basis"].isin(["foodkeeper", "assumption"]).all():
        raise ValueError("shelf_life.csv: basis must be 'foodkeeper' or 'assumption'")
    if (planning["planning_days"] <= 0).any():
        raise ValueError("shelf_life.csv: planning days must be positive")
    return frame


def planning_shelf_life_days(category: str) -> int:
    """Planning shelf life (days from receipt) for a category."""
    rows = load_shelf_life().dropna(subset=["planning_days"]).query("category_id == @category")
    if len(rows) != 1:
        raise KeyError(f"no planning shelf life for category {category!r}")
    return int(rows["planning_days"].iloc[0])

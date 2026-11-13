"""Shared pytest configuration: tests marked `data` skip when the raw datasets are absent (CI)."""

from __future__ import annotations

import pytest

from freshpipe.config import repo_path

REQUIRED_RAW_FILES = ("frn50k_train", "frn50k_eval", "frnlt_train", "frnlt_eval")


def raw_data_available() -> bool:
    """True when every required raw file and the Kaggle folder exist locally."""
    files_ok = all(repo_path(key).is_file() for key in REQUIRED_RAW_FILES)
    return files_ok and repo_path("veg_dir").is_dir()


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if raw_data_available():
        return
    skip = pytest.mark.skip(reason="raw datasets not found in Datasets/ (expected in CI); run locally")
    for item in items:
        if "data" in item.keywords:
            item.add_marker(skip)

"""Raw-data checks (marked `data`; they run locally and skip in CI).

They pin the facts the plan relies on (docs/03-data-inspection.md), so a wrong download or a
changed upstream file is caught before any modelling starts.
"""

from __future__ import annotations

import hashlib

import numpy as np
import pyarrow.compute as pc
import pyarrow.parquet as pq
import pytest

from freshpipe.config import repo_path

pytestmark = pytest.mark.data

EXPECTED_SIZES = {
    "frn50k_train": 106_436_287,
    "frn50k_eval": 8_440_124,
    "frnlt_train": 315_398_578,
    "frnlt_eval": 2_009_424,
}
EXPECTED_LT_SHA256 = {
    "frnlt_train": "e744c537ed16a8254c50f8456de7c5614866d4d8b6787e3cc3b67be02ea2f1e3",
    "frnlt_eval": "370ca7f995d2a059744e1659eb681e60db694bec2f80a84252426afdd2b6d626",
}
EXPECTED_VEG_SIZES = {
    "annex1.csv": 16_597,
    "annex2.csv": 51_794_172,
    "annex3.csv": 1_843_940,
    "annex4.csv": 10_805,
}


def _sha256(path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


@pytest.mark.parametrize(("key", "size"), sorted(EXPECTED_SIZES.items()))
def test_parquet_files_have_expected_sizes(key: str, size: int) -> None:
    assert repo_path(key).stat().st_size == size


@pytest.mark.parametrize(("key", "digest"), sorted(EXPECTED_LT_SHA256.items()))
def test_lt_files_match_published_checksums(key: str, digest: str) -> None:
    assert _sha256(repo_path(key)) == digest


@pytest.mark.parametrize(("name", "size"), sorted(EXPECTED_VEG_SIZES.items()))
def test_kaggle_files_have_expected_sizes(name: str, size: int) -> None:
    assert (repo_path("veg_dir") / name).stat().st_size == size


@pytest.mark.parametrize("key", ["frn50k_train", "frnlt_train"])
def test_stock_flag_one_means_out_of_stock(key: str) -> None:
    """Cleaning rule C1: the count of 1s in hours 06:00-21:59 equals stock_hour6_22_cnt."""
    parquet = pq.ParquetFile(repo_path(key))
    batch = next(parquet.iter_batches(batch_size=50_000, columns=["hours_stock_status", "stock_hour6_22_cnt"]))
    status = pc.list_flatten(batch.column("hours_stock_status")).to_numpy(zero_copy_only=False)
    status = status.reshape(batch.num_rows, 24)
    expected = batch.column("stock_hour6_22_cnt").to_numpy(zero_copy_only=False)
    assert np.array_equal((status[:, 6:22] == 1).sum(axis=1), expected)

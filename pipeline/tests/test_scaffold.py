"""Scaffold checks: configuration and repository paths."""

from __future__ import annotations

from datetime import date

from freshpipe.config import REPO_ROOT, load_config, repo_path


def test_config_has_valid_seed_and_ordered_dates() -> None:
    config = load_config()
    assert isinstance(config["seed"], int)
    horizon_start = date.fromisoformat(config["horizon"]["start"])
    horizon_end = date.fromisoformat(config["horizon"]["end"])
    train_end = date.fromisoformat(config["splits"]["train_end"])
    validation_end = date.fromisoformat(config["splits"]["validation_end"])
    test_start = date.fromisoformat(config["splits"]["test_start"])
    assert horizon_start < train_end < validation_end < test_start <= horizon_end
    # 1 Jan 2023 to 31 Oct 2026 inclusive is 1,400 days (plan §3.4).
    assert (horizon_end - horizon_start).days + 1 == 1400


def test_forecast_quantiles_are_sorted_and_buckets_contiguous() -> None:
    forecast = load_config()["forecast"]
    assert forecast["quantiles"] == sorted(forecast["quantiles"])
    buckets = forecast["horizon_buckets"]
    for (_, previous_end), (start, _) in zip(buckets, buckets[1:]):
        assert start == previous_end + 1


def test_all_configured_paths_stay_inside_the_repository() -> None:
    for key in load_config()["paths"]:
        assert repo_path(key).resolve().is_relative_to(REPO_ROOT.resolve())


def test_committed_folders_exist() -> None:
    for key in ("web_data", "contracts", "processed", "external"):
        assert repo_path(key).is_dir(), f"missing folder for paths.{key}"

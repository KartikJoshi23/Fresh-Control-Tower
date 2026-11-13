"""Configuration loading and repository paths for the pipeline."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_DIR.parent
CONFIG_PATH = PIPELINE_DIR / "config.yaml"


@lru_cache(maxsize=1)
def load_config() -> dict[str, Any]:
    """Return the parsed pipeline/config.yaml (cached for the life of the process)."""
    with CONFIG_PATH.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def repo_path(key: str) -> Path:
    """Absolute path for an entry under `paths:` in config.yaml."""
    return REPO_ROOT / load_config()["paths"][key]

"""Validate exported artefacts against the data contracts (implementation-plan.md §2.4).

The JSON Schemas in docs/contracts/ are generated from the web app's Zod contracts
(`npm run contracts:export`), so the pipeline and the dashboard check exactly the same shapes.
Cross-field rules that JSON Schema cannot express (for example "AHP weights sum to 1") are
enforced in TypeScript and re-checked by the tests of the part that produces each file.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .config import repo_path

#: Fixed artefact paths (relative to web/public/data) and the schema that validates each one.
FILE_SCHEMAS: dict[str, str] = {
    "meta.json": "meta",
    "catalog.json": "catalog",
    "calendar.json": "calendar",
    "weather.json": "weather",
    "backtest.json": "backtest",
    "frontier.json": "frontier",
    "realdata.json": "realdata",
    "ablation.json": "ablation",
    "mcdm.json": "mcdm",
    "routes.json": "routes",
    "impact.json": "impact",
    "live/feed.json": "live-feed",
}

SERIES_PATTERN = re.compile(r"^series/[a-z0-9][a-z0-9_-]*__[a-z0-9][a-z0-9_-]*\.json$")


def schema_name_for(relative_path: str) -> str | None:
    """Return the schema name for a path relative to web/public/data, or None if none applies."""
    path = relative_path.replace("\\", "/")
    if path in FILE_SCHEMAS:
        return FILE_SCHEMAS[path]
    if SERIES_PATTERN.match(path):
        return "series"
    return None


@lru_cache(maxsize=None)
def load_validator(schema_name: str) -> Draft202012Validator:
    """Load docs/contracts/{schema_name}.schema.json as a draft 2020-12 validator."""
    schema_path = repo_path("contracts") / f"{schema_name}.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)


def validate_document(document: Any, schema_name: str) -> list[str]:
    """Return human-readable contract violations for one parsed document (empty list = valid)."""
    validator = load_validator(schema_name)
    return [
        f"{'/'.join(str(p) for p in error.absolute_path) or '(root)'}: {error.message}"
        for error in sorted(validator.iter_errors(document), key=lambda e: list(e.absolute_path))
    ]


def validate_directory(root: Path | None = None) -> dict[str, list[str]]:
    """Validate every JSON file under `root` (default web/public/data). Maps path -> violations."""
    root = root or repo_path("web_data")
    results: dict[str, list[str]] = {}
    for file in sorted(root.rglob("*.json")):
        relative = file.relative_to(root).as_posix()
        name = schema_name_for(relative)
        if name is None:
            results[relative] = ["no data contract matches this path"]
            continue
        results[relative] = validate_document(json.loads(file.read_text(encoding="utf-8")), name)
    return results

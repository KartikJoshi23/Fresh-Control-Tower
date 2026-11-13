"""Cross-language contract checks: the web artefacts validate against the exported JSON Schemas."""

from __future__ import annotations

import copy
import json

import pytest

from freshpipe.config import repo_path
from freshpipe.contracts import FILE_SCHEMAS, schema_name_for, validate_directory, validate_document


def test_every_schema_file_exists() -> None:
    expected = set(FILE_SCHEMAS.values()) | {"series"}
    present = {p.name.removesuffix(".schema.json") for p in repo_path("contracts").glob("*.schema.json")}
    assert expected <= present, f"missing schemas: {sorted(expected - present)}"


def test_every_web_artefact_matches_its_contract() -> None:
    results = validate_directory()
    assert results, "no artefacts found in web/public/data"
    failures = {path: errors for path, errors in results.items() if errors}
    assert not failures, json.dumps(failures, indent=2)


@pytest.mark.parametrize(
    ("path", "schema"),
    [
        ("meta.json", "meta"),
        ("live/feed.json", "live-feed"),
        ("series/dxb-marina__lettuce-romaine.json", "series"),
        ("series\\dxb-marina__lettuce-romaine.json", "series"),
        ("unknown.json", None),
    ],
)
def test_schema_lookup(path: str, schema: str | None) -> None:
    assert schema_name_for(path) == schema


def test_contract_rejects_wrong_version_and_unknown_keys() -> None:
    meta = json.loads((repo_path("web_data") / "meta.json").read_text(encoding="utf-8"))
    wrong_version = copy.deepcopy(meta) | {"contractVersion": "0.9.0"}
    unknown_key = copy.deepcopy(meta) | {"surprise": True}
    assert validate_document(wrong_version, "meta")
    assert validate_document(unknown_key, "meta")

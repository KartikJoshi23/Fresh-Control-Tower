"""UAE calendar: sourced events, the UAE weekend, festival phases and the contract."""

from __future__ import annotations

import pytest

from freshpipe import calendar_uae
from freshpipe.artefacts import write_artefact


@pytest.fixture(scope="module")
def days() -> dict[str, dict]:
    body, _ = calendar_uae.calendar_body()
    return {row["date"]: row for row in body["days"]}


def test_every_event_is_sourced_and_well_formed() -> None:
    events = calendar_uae.load_events()  # raises on unsourced, unknown-family or inverted events
    assert len(events) >= 30
    assert all(event.source_ids for event in events)


def test_family_names_need_a_year_suffix() -> None:
    assert calendar_uae.family_of("eid-al-fitr-2026") == "eid-al-fitr"
    with pytest.raises(ValueError):
        calendar_uae.family_of("eid-al-fitr")


def test_calendar_covers_the_whole_horizon_with_a_saturday_sunday_weekend(days: dict[str, dict]) -> None:
    assert len(days) == 1400
    assert min(days) == "2023-01-01" and max(days) == "2026-10-31"
    assert days["2023-01-01"]["weekday"] == 6 and days["2023-01-01"]["isWeekend"]   # Sunday
    assert days["2026-02-20"]["weekday"] == 4 and not days["2026-02-20"]["isWeekend"]  # Friday


def test_ramadan_2026_phases_and_eid_priority(days: dict[str, dict]) -> None:
    assert days["2026-02-11"]["festivalPhase"] == "pre"                       # 7-day stock-up window
    first = days["2026-02-18"]
    assert (first["festivalId"], first["festivalPhase"], first["ramadanDay"]) == ("ramadan-2026", "during", 1)
    last = days["2026-03-19"]                                                 # Ramadan day 30 and Eid holiday
    assert last["festivalId"] == "eid-al-fitr-2026" and last["ramadanDay"] == 30 and last["publicHoliday"]


def test_public_and_school_holidays(days: dict[str, dict]) -> None:
    assert days["2025-12-02"]["festivalId"] == "national-day-2025" and days["2025-12-02"]["publicHoliday"]
    assert days["2026-07-15"]["schoolHoliday"] and not days["2026-07-15"]["publicHoliday"]
    assert not days["2026-10-15"]["schoolHoliday"]


def test_calendar_json_passes_its_contract(tmp_path) -> None:
    body, sources = calendar_uae.calendar_body()
    path = write_artefact("calendar.json", body, provenance="REAL", sources=sources, root=tmp_path)
    assert path.exists()

"""UAE festival and holiday calendar (task P1-03).

data/external/uae_calendar.csv (one row per event, each with its source ids) → calendar.json:
the festival list plus one row per day of the horizon, with the weekend, festival phase,
Ramadan day, public holiday and school holiday flags. No date enters without a registered source.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from .config import load_config, repo_path
from .sources import SOURCE_IDS

#: Days before / after an event that count as its "pre" / "post" phase (stock-up and wind-down).
PRE_DAYS = {"ramadan": 7, "eid-al-adha": 3, "national-day": 2}
POST_DAYS = {"eid-al-fitr": 2, "eid-al-adha": 2}

#: When events overlap on a day, the earlier family in this list wins.
PRIORITY = ("eid-al-fitr", "eid-al-adha", "ramadan", "national-day", "hijri-new-year", "mawlid",
            "new-year", "summer-break")

#: The UAE weekend has been Saturday–Sunday since 1 January 2022 (the whole horizon).
WEEKEND_DAYS = (5, 6)  # Monday = 0

REQUIRED_COLUMNS = ("event_id", "name", "kind", "start", "end", "public_holiday", "source_ids", "verified", "note")


@dataclass(frozen=True)
class Event:
    event_id: str
    family: str
    name: str
    kind: str
    start: date
    end: date
    public_holiday: bool
    source_ids: tuple[str, ...]
    verified: bool


def family_of(event_id: str) -> str:
    """'eid-al-fitr-2026' -> 'eid-al-fitr'."""
    stem, _, year = event_id.rpartition("-")
    if not (year.isdigit() and len(year) == 4):
        raise ValueError(f"event id {event_id!r} must end with -YYYY")
    return stem


def load_events(path: Path | None = None) -> list[Event]:
    """Read and validate the curated calendar. Raises ValueError on any integrity problem."""
    frame = pd.read_csv(path or repo_path("external") / "uae_calendar.csv", dtype=str).fillna("")
    missing = set(REQUIRED_COLUMNS) - set(frame.columns)
    if missing:
        raise ValueError(f"uae_calendar.csv is missing columns {sorted(missing)}")
    events = []
    for row in frame.itertuples(index=False):
        sources = tuple(s for s in row.source_ids.split(";") if s)
        unknown = set(sources) - SOURCE_IDS
        if not sources or unknown:
            raise ValueError(f"{row.event_id}: every event needs registered sources (unknown: {sorted(unknown)})")
        start, end = date.fromisoformat(row.start), date.fromisoformat(row.end)
        if start > end:
            raise ValueError(f"{row.event_id}: start {start} is after end {end}")
        events.append(Event(row.event_id, family_of(row.event_id), row.name, row.kind, start, end,
                            row.public_holiday.lower() == "true", sources, row.verified.lower() == "true"))
    if len({e.event_id for e in events}) != len(events):
        raise ValueError("duplicate event ids in uae_calendar.csv")
    unknown_families = {e.family for e in events} - set(PRIORITY)
    if unknown_families:
        raise ValueError(f"no priority defined for event families {sorted(unknown_families)}")
    return events


def _day_rows(events: list[Event], start: date, end: date) -> list[dict[str, object]]:
    rank = {family: i for i, family in enumerate(PRIORITY)}
    rows = []
    day = start
    while day <= end:
        candidates = []
        ramadan_day = None
        public_holiday = school_holiday = False
        for event in events:
            pre = timedelta(days=PRE_DAYS.get(event.family, 0))
            post = timedelta(days=POST_DAYS.get(event.family, 0))
            if event.start <= day <= event.end:
                candidates.append((0, rank[event.family], event, "during"))
                public_holiday |= event.public_holiday
                school_holiday |= event.kind == "school"
                if event.family == "ramadan":
                    ramadan_day = (day - event.start).days + 1
            elif event.start - pre <= day < event.start:
                candidates.append((1, rank[event.family], event, "pre"))
            elif event.end < day <= event.end + post:
                candidates.append((1, rank[event.family], event, "post"))
        chosen = min(candidates, key=lambda c: (c[0], c[1])) if candidates else None
        rows.append({
            "date": day.isoformat(),
            "weekday": day.weekday(),
            "isWeekend": day.weekday() in WEEKEND_DAYS,
            "festivalId": chosen[2].event_id if chosen else None,
            "festivalPhase": chosen[3] if chosen else "none",
            "ramadanDay": ramadan_day,
            "publicHoliday": public_holiday,
            "schoolHoliday": school_holiday,
        })
        day += timedelta(days=1)
    return rows


def calendar_body(events: list[Event] | None = None) -> tuple[dict[str, object], list[str]]:
    """The calendar.json body and the source ids it cites."""
    events = events if events is not None else load_events()
    horizon = load_config()["horizon"]
    start, end = date.fromisoformat(horizon["start"]), date.fromisoformat(horizon["end"])
    in_horizon = [e for e in events if e.end >= start and e.start <= end]
    festivals = [{"id": e.event_id, "name": e.name, "kind": e.kind, "start": e.start.isoformat(),
                  "end": e.end.isoformat(), "sourceId": e.source_ids[0]} for e in in_horizon]
    sources = sorted({s for e in in_horizon for s in e.source_ids})
    return {"festivals": festivals, "days": _day_rows(in_horizon, start, end)}, sources

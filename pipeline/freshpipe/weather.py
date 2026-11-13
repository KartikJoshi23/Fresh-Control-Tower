"""UAE daily weather (task P1-04).

Real daily weather for Dubai, Sharjah and Abu Dhabi from the Open-Meteo Historical Weather API
(ERA5 reanalysis; CC BY 4.0, free for non-commercial use). It is fetched once and committed to
data/external/weather_uae.csv, so the pipeline runs offline and reproducibly afterwards.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

from .config import load_config, repo_path

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARIABLES = ("temperature_2m_max", "temperature_2m_mean", "precipitation_sum")

#: City-centre coordinates (approximate, rounded to 4 decimals).
LOCATIONS: dict[str, tuple[float, float]] = {
    "Dubai": (25.2048, 55.2708),
    "Sharjah": (25.3463, 55.4209),
    "Abu Dhabi": (24.4539, 54.3773),
}

CSV_COLUMNS = ("date", "emirate", "tMaxC", "tMeanC", "precipMm", "latitude", "longitude", "source_id")


def parse_response(payload: dict, emirate: str, lat: float, lon: float) -> pd.DataFrame:
    """Turn one Open-Meteo `daily` response into tidy rows. Raises if any value is missing."""
    daily = payload["daily"]
    frame = pd.DataFrame({
        "date": daily["time"],
        "emirate": emirate,
        "tMaxC": daily["temperature_2m_max"],
        "tMeanC": daily["temperature_2m_mean"],
        "precipMm": daily["precipitation_sum"],
        "latitude": lat,
        "longitude": lon,
        "source_id": "open-meteo",
    })
    if frame[["tMaxC", "tMeanC", "precipMm"]].isna().any().any():
        raise ValueError(f"Open-Meteo returned missing values for {emirate}")
    return frame


def fetch(start: str, end: str, timeout: int = 60) -> pd.DataFrame:
    """Download daily weather for every location (three small API calls; no personal data is sent)."""
    frames = []
    for emirate, (lat, lon) in LOCATIONS.items():
        query = urllib.parse.urlencode({
            "latitude": lat, "longitude": lon, "start_date": start, "end_date": end,
            "daily": ",".join(DAILY_VARIABLES), "timezone": "Asia/Dubai",
        })
        request = urllib.request.Request(f"{ARCHIVE_URL}?{query}", headers={"User-Agent": "freshpipe"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            frames.append(parse_response(json.load(response), emirate, lat, lon))
    return pd.concat(frames, ignore_index=True)


def csv_path() -> Path:
    return repo_path("external") / "weather_uae.csv"


def load_weather(path: Path | None = None) -> pd.DataFrame:
    """Read the committed weather CSV and check it covers every day of the horizon for every emirate."""
    frame = pd.read_csv(path or csv_path())
    if tuple(frame.columns) != CSV_COLUMNS:
        raise ValueError(f"weather_uae.csv columns must be {CSV_COLUMNS}")
    horizon = load_config()["horizon"]
    expected = pd.date_range(horizon["start"], horizon["end"], freq="D").strftime("%Y-%m-%d")
    for emirate in LOCATIONS:
        dates = frame.loc[frame["emirate"] == emirate, "date"]
        if list(dates) != list(expected):
            raise ValueError(f"weather_uae.csv does not cover every horizon day for {emirate}")
    return frame


def weather_body(frame: pd.DataFrame) -> dict[str, object]:
    """The weather.json body (rows only; coordinates and source stay in the CSV)."""
    rows = frame[["date", "emirate", "tMaxC", "tMeanC", "precipMm"]].to_dict(orient="records")
    return {"rows": rows}

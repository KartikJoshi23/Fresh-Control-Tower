"""Fresh Control Tower pipeline command line.

Usage, from the repository root:

    python pipeline/run.py --step part1              # everything in Part 1, in order
    python pipeline/run.py --step clean              # raw data -> data/interim + cleaning_report.json
    python pipeline/run.py --step calibrate          # data/interim -> data/processed/calibration.json
    python pipeline/run.py --step calendar           # -> web/public/data/calendar.json
    python pipeline/run.py --step weather [--refresh]   # (re)fetch Open-Meteo -> weather.json
    python pipeline/run.py --step routes             # -> web/public/data/routes.json
    python pipeline/run.py --step meta               # -> web/public/data/meta.json

Later parts add steps (generate, train, backtest, export).
"""

from __future__ import annotations

import argparse
import gc
import json
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd  # noqa: E402

from freshpipe import calendar_uae, calibrate, clean, geography, ingest, weather  # noqa: E402
from freshpipe.artefacts import write_artefact, write_meta  # noqa: E402
from freshpipe.config import load_config, repo_path  # noqa: E402

LOG = logging.getLogger("freshpipe")
FRN_DATASETS = {"frn50k": "frn50k_train", "frnlt": "frnlt_train"}


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def step_clean() -> None:
    """Apply cleaning rules C1–C14; cache daily tables in data/interim; write cleaning_report.json."""
    interim = repo_path("interim")
    interim.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {}
    hourly: dict[str, object] = {}
    for dataset, key in FRN_DATASETS.items():
        LOG.info("cleaning %s …", dataset)
        result = clean.clean_frn(repo_path(key), dataset)
        result.daily.to_parquet(interim / f"{dataset}_daily.parquet", index=False)
        report[dataset] = result.report
        hourly[dataset] = result.hourly
        del result
        gc.collect()
    LOG.info("cleaning Kaggle vegetables …")
    report["veg"] = clean.clean_veg(ingest.read_veg(repo_path("veg_dir"))).report
    _write_json(interim / "frn_hourly.json", hourly)
    _write_json(repo_path("processed") / "cleaning_report.json", report)


def step_calibrate() -> None:
    """Measure calibration parameters from the cleaned tables → data/processed/calibration.json."""
    interim = repo_path("interim")
    hourly = json.loads((interim / "frn_hourly.json").read_text(encoding="utf-8"))
    sections = {}
    for dataset in FRN_DATASETS:
        LOG.info("calibrating %s …", dataset)
        daily = pd.read_parquet(interim / f"{dataset}_daily.parquet")
        sections[dataset] = calibrate.frn_section(daily, hourly[dataset], seasonality=dataset == "frnlt")
        del daily
        gc.collect()
    LOG.info("calibrating Kaggle vegetables …")
    sveg = calibrate.veg_section(clean.clean_veg(ingest.read_veg(repo_path("veg_dir"))))
    inputs = {key: repo_path(key).stat().st_size for key in FRN_DATASETS.values()}
    inputs |= {f"veg/{p.name}": p.stat().st_size for p in sorted(repo_path("veg_dir").glob("annex*.csv"))}
    payload = calibrate.assemble_calibration(sections["frn50k"], sections["frnlt"], sveg, inputs)
    _write_json(repo_path("processed") / "calibration.json", payload)


def step_calendar() -> None:
    body, sources = calendar_uae.calendar_body()
    write_artefact("calendar.json", body, provenance="REAL", sources=sources)


def step_weather(refresh: bool) -> None:
    if refresh or not weather.csv_path().exists():
        horizon = load_config()["horizon"]
        LOG.info("fetching Open-Meteo weather %s → %s …", horizon["start"], horizon["end"])
        frame = weather.fetch(horizon["start"], horizon["end"])
        frame.to_csv(weather.csv_path(), index=False, lineterminator="\n")
    frame = weather.load_weather()
    write_artefact("weather.json", weather.weather_body(frame), provenance="REAL", sources=["open-meteo"])


def step_routes() -> None:
    # Real places and chokepoints; supplier names are labelled fictional inside the file.
    write_artefact("routes.json", geography.routes_body(), provenance="REAL",
                   sources=["fathallah2024-atlantic-council", "sohail2026-gulf-business"], pretty=True)


def step_meta() -> None:
    write_meta()


STEPS = {
    "clean": step_clean,
    "calibrate": step_calibrate,
    "calendar": step_calendar,
    "weather": None,  # needs --refresh; dispatched below
    "routes": step_routes,
    "meta": step_meta,
}
PART1 = ("clean", "calibrate", "calendar", "weather", "routes", "meta")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fresh Control Tower pipeline")
    parser.add_argument("--step", required=True, choices=[*STEPS, "part1"])
    parser.add_argument("--refresh", action="store_true", help="re-download weather from Open-Meteo")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    for step in (PART1 if args.step == "part1" else (args.step,)):
        started = time.perf_counter()
        if step == "weather":
            step_weather(args.refresh)
        else:
            STEPS[step]()
        LOG.info("step %-9s done in %5.1fs", step, time.perf_counter() - started)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

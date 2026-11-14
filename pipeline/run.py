"""Fresh Control Tower pipeline command line.

Usage, from the repository root:

    python pipeline/run.py --step part1              # everything in Part 1, in order
    python pipeline/run.py --step clean              # raw data -> data/interim + cleaning_report.json
    python pipeline/run.py --step calibrate          # data/interim -> data/processed/calibration.json
    python pipeline/run.py --step calendar           # -> web/public/data/calendar.json
    python pipeline/run.py --step weather [--refresh]   # (re)fetch Open-Meteo -> weather.json
    python pipeline/run.py --step routes             # -> web/public/data/routes.json
    python pipeline/run.py --step meta               # -> web/public/data/meta.json

    python pipeline/run.py --step part2              # everything in Part 2, in order
    python pipeline/run.py --step generate           # synthetic world -> data/synthetic/world.* + catalog.json
    python pipeline/run.py --step simulate           # P0 baseline, hour by hour -> data/synthetic/p0_*
    python pipeline/run.py --step fidelity           # re-run P0 and check the bands -> data/processed/fidelity_report.json

    python pipeline/run.py --step part3              # everything in Part 3, in order
    python pipeline/run.py --step recover            # recover hidden demand in the P0 history -> data/synthetic/recovered.npz
    python pipeline/run.py --step realdata           # FRN-50K masking + forecast-bias tests -> realdata.json (needs Datasets/)
    python pipeline/run.py --step forecast           # quantile forecasts + baselines -> data/synthetic/forecasts.npz
    python pipeline/run.py --step ablation           # feature-group ablation (KQ2) -> ablation.json
    python pipeline/run.py --step spikes             # spike detector, tuned on 2025, scored on 2026

Later parts add steps (backtest, export).
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

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from freshpipe import (calendar_uae, calibrate, clean, fidelity, generate, geography, ingest, masking,  # noqa: E402
                       recover, simulate, weather)
from freshpipe.artefacts import write_artefact, write_meta  # noqa: E402
from freshpipe.config import load_config, repo_path  # noqa: E402
from freshpipe.world import catalog_body  # noqa: E402

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


def _calibration() -> dict:
    return json.loads((repo_path("processed") / "calibration.json").read_text(encoding="utf-8"))


def step_generate() -> None:
    """Generate the synthetic world (P2-01) and write catalog.json."""
    config = load_config()
    world = generate.generate_world(config)
    generate.save_world(world)
    write_artefact("catalog.json", catalog_body(_calibration(), world.seed), provenance="CALIBRATED_SYNTHETIC",
                   sources=["yapwh2023-vegetables", "usda-foodkeeper"], seed=world.seed, pretty=True)
    LOG.info("world: %s", json.dumps(world.params))


def step_simulate() -> None:
    """Run the P0 baseline over the saved world, hour by hour (P2-02)."""
    config = load_config()
    world = generate.load_world()
    result = simulate.simulate(world, simulate.BaselinePolicy.from_config(config), config=config)
    simulate.save_run(result, world)


def step_fidelity() -> None:
    """Re-run P0 deterministically, confirm it matches the saved run, and write the fidelity report (P2-03)."""
    config = load_config()
    world = generate.load_world()
    result = simulate.simulate(world, simulate.BaselinePolicy.from_config(config), config=config)
    manifest_path = repo_path("synthetic") / "p0_manifest.json"
    if manifest_path.exists():
        saved = json.loads(manifest_path.read_text(encoding="utf-8"))["checksums"]["sales_h"]
        fresh = generate.checksum(result.sales_h[:, result.horizon].astype("int16"))
        if saved != fresh:
            raise SystemExit("the saved P0 run differs from a fresh run: re-run --step simulate")
    report = fidelity.build_report(world, result, _calibration())
    fidelity.write_report(report)
    failed = [c["id"] for c in report["checks"] if not c["pass"]] + [a["id"] for a in report["anchors"] if not a["pass"]]
    LOG.info("fidelity: %d/%d checks pass; anchors %d/%d", report["summary"]["passed"], report["summary"]["checks"],
             report["summary"]["anchorsPassed"], report["summary"]["anchors"])
    if failed:
        raise SystemExit(f"fidelity bands failed: {failed}")


def _update_model_report(section: str, payload: object) -> None:
    """Merge one section into data/processed/model_report.json (Part 3 metrics, report Appendix B)."""
    path = repo_path("processed") / "model_report.json"
    report = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"reportVersion": "1.0"}
    report[section] = payload
    _write_json(path, report)


def _load_p0() -> tuple[generate.World, "np.ndarray", "np.ndarray"]:
    world = generate.load_world()
    hourly = np.load(repo_path("synthetic") / "p0_hourly.npz")
    return world, hourly["sales_h"], hourly["oos_h"]


def step_recover() -> None:
    """Recover hidden demand in the P0 history (P3-01) and score it against the known truth."""
    config = load_config()
    world, sales_h, oos = _load_p0()
    rec, report = recover.recover_p0(world, sales_h, oos, config)
    np.savez_compressed(repo_path("synthetic") / "recovered.npz", daily=rec.daily.astype(np.float32))
    _update_model_report("recovery", report)
    LOG.info("recovery (%s): %s", rec.method, json.dumps(report["profile"]["test"]))


def step_realdata() -> None:
    """Masking and forecast-bias tests on the REAL FreshRetailNet-50K data (P3-02) -> realdata.json."""
    config = load_config()
    train = masking.load_cube(repo_path("frn50k_train"))
    mask = masking.masking_test(train, seed=config["seed"])
    bias = masking.forecast_bias_test(train, masking.load_cube(repo_path("frn50k_eval")), seed=config["seed"])
    period = {"start": str(train.dates[0].date()), "end": str(train.dates[-1].date())}
    calibration = json.loads((repo_path("processed") / "calibration.json").read_text(encoding="utf-8"))
    write_artefact("realdata.json", masking.realdata_body(calibration, period, mask, bias), provenance="REAL",
                   sources=["dingdong2025-frn50k", "dingdong2026-frnlt", "wang2025-freshretailnet"],
                   seed=config["seed"], pretty=True)
    _update_model_report("realdata", {"masking": mask, "forecast_bias": bias})
    LOG.info("realdata: masking %s; bias raw %s -> recovered %s", mask["hidden_wape"],
             bias["raw_sales"]["wpe_in_stock_hours"], bias["recovered"]["wpe_in_stock_hours"])


STEPS = {
    "clean": step_clean,
    "calibrate": step_calibrate,
    "calendar": step_calendar,
    "weather": None,  # needs --refresh; dispatched below
    "routes": step_routes,
    "meta": step_meta,
    "generate": step_generate,
    "simulate": step_simulate,
    "fidelity": step_fidelity,
    "recover": step_recover,
    "realdata": step_realdata,
}
PART1 = ("clean", "calibrate", "calendar", "weather", "routes", "meta")
PART2 = ("routes", "generate", "simulate", "fidelity")
PART3 = ("recover", "realdata")
PARTS = {"part1": PART1, "part2": PART2, "part3": PART3}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fresh Control Tower pipeline")
    parser.add_argument("--step", required=True, choices=[*STEPS, *PARTS])
    parser.add_argument("--refresh", action="store_true", help="re-download weather from Open-Meteo")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    for step in PARTS.get(args.step, (args.step,)):
        started = time.perf_counter()
        if step == "weather":
            step_weather(args.refresh)
        else:
            STEPS[step]()
        LOG.info("step %-9s done in %5.1fs", step, time.perf_counter() - started)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

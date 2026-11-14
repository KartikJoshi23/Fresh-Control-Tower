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

    python pipeline/run.py --step part4              # everything in Part 4, in order
    python pipeline/run.py --step mcdm               # AHP + entropy + TOPSIS supplier ranking -> mcdm.json
    python pipeline/run.py --step tau                # per-SKU service quantile, tuned on 2025 H2 -> data/synthetic/tau.npz
    python pipeline/run.py --step backtest           # Monte Carlo P0-P3 x stress windows -> backtest.json, frontier.json
    python pipeline/run.py --step export             # hero series, live feed, golden engine cases, meta.json
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

from freshpipe import (backtest, calendar_uae, calibrate, clean, export, fidelity, forecast, generate,  # noqa: E402
                       geography, impact, ingest, masking, mcdm, recover, simulate, spikes, weather)
from freshpipe.artefacts import write_artefact, write_meta  # noqa: E402
from freshpipe.config import load_config, repo_path  # noqa: E402
from freshpipe.world import STORES, catalog_body  # noqa: E402

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
    if not (repo_path("frn50k_train").is_file() and repo_path("frn50k_eval").is_file()):
        LOG.warning("realdata skipped: FreshRetailNet-50K is not in Datasets/ (the committed realdata.json is kept)")
        return
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


def _recovered_and_recorded() -> tuple["np.ndarray", "np.ndarray"]:
    recovered = np.load(repo_path("synthetic") / "recovered.npz")["daily"].astype(float)
    recorded = np.load(repo_path("synthetic") / "p0_hourly.npz")["sales_h"].sum(axis=2).astype(float)
    return recovered, recorded


def step_forecast() -> None:
    """Nine quantile models + the naive variant + baselines, scored on 2026 (P3-03)."""
    config = load_config()
    world = generate.load_world()
    recovered, recorded = _recovered_and_recorded()
    run = forecast.forecast_world(world, recovered, recorded, config)
    np.savez_compressed(repo_path("synthetic") / "forecasts.npz", quantiles=run.quantiles, naive=run.naive_quantiles,
                        buckets=np.array(forecast.BUCKETS), quantile_levels=np.array(forecast.QUANTILES))
    _update_model_report("forecast", run.report)
    LOG.info("forecast 1-7 days: %s", json.dumps(run.report["buckets"]["1-7"]["ai_recovered"]))


def step_ablation() -> None:
    """Feature-group ablation for KQ2 (P3-04) -> ablation.json."""
    config = load_config()
    world = generate.load_world()
    recovered, recorded = _recovered_and_recorded()
    body = forecast.ablation(world, recovered, recorded, config)
    write_artefact("ablation.json", body, provenance="PRECOMPUTED", sources=[], seed=config["seed"], pretty=True)
    _update_model_report("ablation", body)
    LOG.info("ablation: %s", [(g["id"], g["deltaWape"]) for g in body["groups"]])


def step_spikes() -> None:
    """Tune the spike detector on 2025 H2 and score it on 2026 (P3-05)."""
    config = load_config()
    world = generate.load_world()
    hourly = np.load(repo_path("synthetic") / "p0_hourly.npz")
    sales_h, oos = hourly["sales_h"], hourly["oos_h"]
    recovered, _ = _recovered_and_recorded()
    inp = forecast.world_forecast_inputs(world, config)
    fit = np.asarray(inp.dates <= pd.Timestamp(config["splits"]["train_end"]))
    train = np.asarray(inp.dates <= pd.Timestamp(config["splits"]["validation_end"]))
    p50_val = forecast.fit_predict(recovered, inp, fit, bucket=0, quantiles=(0.5,), seed=config["seed"])[0]
    p50_test = np.load(repo_path("synthetic") / "forecasts.npz")["quantiles"][0, 1].astype(float)
    ri = recover.world_inputs(world, config)
    prof = recover.day_profiles(recover.estimate_profiles(sales_h, oos, ri["groups"], ri["special_day"], ri["fit"]),
                                ri["special_day"])
    h = world.horizon
    report = spikes.detector_report(world.demand_h[:, h], sales_h, p50_val, p50_test, prof, world.event_kind[:, h],
                                    world.multiplier[:, h], train & ~fit, ~train, n_stores=len(STORES))
    _update_model_report("spikes", report)
    LOG.info("spikes item %s; store %s", json.dumps(report["item"]["test"]), json.dumps(report["store"]["test"]))


def _backtest_context(fc: "np.ndarray | None" = None, tau: "np.ndarray | None" = None) -> backtest.Context:
    """Inputs shared by the Part 4 steps (forecasts default to the Part 3 test-window models)."""
    config = load_config()
    world = generate.load_world()
    hourly = np.load(repo_path("synthetic") / "p0_hourly.npz")
    ri = recover.world_inputs(world, config)
    prof = recover.day_profiles(recover.estimate_profiles(hourly["sales_h"], hourly["oos_h"], ri["groups"],
                                                          ri["special_day"], ri["fit"]), ri["special_day"])
    if fc is None:
        fc = np.load(repo_path("synthetic") / "forecasts.npz")["quantiles"].astype(float)
    if tau is None:
        tau = np.load(repo_path("synthetic") / "tau.npz")["tau"]
    catalog = json.loads((repo_path("web_data") / "catalog.json").read_text(encoding="utf-8"))
    calibration = json.loads((repo_path("processed") / "calibration.json").read_text(encoding="utf-8"))
    return backtest.Context(world, config, catalog, fc, prof, tau, calibration)


def step_mcdm() -> None:
    """AHP (board preference), entropy weights and TOPSIS inputs for the suppliers (P4-03) -> mcdm.json."""
    body = mcdm.mcdm_body()
    write_artefact("mcdm.json", body, provenance="CALIBRATED_SYNTHETIC",
                   sources=["desnz2025-ghg-factors", "goharbakhsh2026-hormuz", "sohail2026-gulf-business"],
                   seed=load_config()["seed"], pretty=True)
    LOG.info("mcdm: AHP CR %.3f; normal ranking %s", body["ahp"]["cr"],
             sorted(mcdm.ranking().items(), key=lambda kv: -kv[1])[:3])


def step_tau() -> None:
    """Per-SKU τ by simulation-optimisation on 2025 H2, with forecasts fitted to Jun 2025 only (P4-01)."""
    config = load_config()
    world = generate.load_world()
    recovered, _ = _recovered_and_recorded()
    inp = forecast.world_forecast_inputs(world, config)
    fit = np.asarray(inp.dates <= pd.Timestamp(config["splits"]["train_end"]))
    fc_val = np.stack([forecast.fit_predict(recovered, inp, fit, bucket=b, seed=config["seed"])
                       for b in range(len(forecast.BUCKETS))])
    ctx = _backtest_context(fc=fc_val, tau=np.full(world.n_series, 0.8))
    tau, report = backtest.optimise_tau(ctx, "2025-07-01", config["splits"]["validation_end"])
    np.savez_compressed(repo_path("synthetic") / "tau.npz", tau=tau)
    _update_model_report("tau", report)
    LOG.info("tau: %s", json.dumps(report))


def step_backtest(runs: int | None = None) -> None:
    """Monte Carlo P0-P3 over the 2026 stress windows (P4-04) and the frontier -> backtest.json, frontier.json;
    then the annualised impact (P4-05) -> impact.json."""
    config = load_config()
    runs = int(runs or config["backtest"]["monte_carlo_runs"])
    ctx = _backtest_context()
    mc = backtest.monte_carlo(ctx, runs, log=LOG.info)
    _write_json(repo_path("synthetic") / "backtest_runs.json", mc)
    sources = ["dingdong2025-frn50k", "yapwh2023-vegetables", "desnz2025-ghg-factors", "poore-nemecek2018"]
    write_artefact("backtest.json", backtest.backtest_body(mc), provenance="PRECOMPUTED", sources=sources,
                   seed=config["seed"], pretty=True)
    write_artefact("frontier.json", backtest.frontier_body(ctx), provenance="PRECOMPUTED", sources=sources,
                   seed=config["seed"], pretty=True)
    write_artefact("impact.json", impact.impact_body(mc), provenance="DERIVED", sources=sources[2:],
                   seed=config["seed"], pretty=True)
    summary = backtest.paired_summary(mc)
    _update_model_report("backtest", {"runs": runs, "paired_vs_p0": summary})
    LOG.info("backtest test-2026 vs P0: %s", json.dumps(summary["test-2026"]))


def step_export() -> None:
    """Hero series files, the live feed, the golden engine cases and meta.json (P4-06)."""
    config = load_config()
    ctx = _backtest_context()
    hourly = np.load(repo_path("synthetic") / "p0_hourly.npz")
    ri = recover.world_inputs(ctx.world, config)
    profiles = recover.estimate_profiles(hourly["sales_h"], hourly["oos_h"], ri["groups"], ri["special_day"], ri["fit"])
    recovered, _ = _recovered_and_recorded()
    p0_daily = pd.read_parquet(repo_path("synthetic") / "p0_daily.parquet")
    sources = ["dingdong2025-frn50k", "yapwh2023-vegetables", "usda-foodkeeper"]
    bodies = export.series_bodies(ctx, p0_daily, recovered, profiles)
    for body in bodies:
        write_artefact(f"series/{body['storeId']}__{body['skuId']}.json", body, provenance="CALIBRATED_SYNTHETIC",
                       sources=sources, seed=config["seed"])
    write_artefact("live/feed.json", export.live_feed_body(ctx), provenance="SIMULATED_FEED", sources=sources[:2],
                   seed=config["seed"])
    _write_json(repo_path("web_data").parent.parent / "tests" / "fixtures" / "golden" / "engine_cases.json",
                export.golden_body(bodies))
    write_meta()
    LOG.info("export: %d series files, live feed, golden cases, meta.json", len(bodies))


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
    "forecast": step_forecast,
    "ablation": step_ablation,
    "spikes": step_spikes,
    "mcdm": step_mcdm,
    "tau": step_tau,
    "backtest": step_backtest,
    "export": step_export,
}
PART1 = ("clean", "calibrate", "calendar", "weather", "routes", "meta")
PART2 = ("routes", "generate", "simulate", "fidelity")
PART3 = ("recover", "realdata", "forecast", "ablation", "spikes")
PART4 = ("mcdm", "tau", "backtest", "export")
PARTS = {"part1": PART1, "part2": PART2, "part3": PART3, "part4": PART4}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fresh Control Tower pipeline")
    parser.add_argument("--step", required=True, choices=[*STEPS, *PARTS])
    parser.add_argument("--refresh", action="store_true", help="re-download weather from Open-Meteo")
    parser.add_argument("--runs", type=int, default=None, help="Monte Carlo runs for --step backtest (default: config)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    for step in PARTS.get(args.step, (args.step,)):
        started = time.perf_counter()
        if step == "weather":
            step_weather(args.refresh)
        elif step == "backtest":
            step_backtest(args.runs)
        else:
            STEPS[step]()
        LOG.info("step %-9s done in %5.1fs", step, time.perf_counter() - started)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

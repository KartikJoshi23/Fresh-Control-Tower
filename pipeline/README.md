# pipeline/ (Track A: Python data and ML pipeline)

Python 3.11. All heavy computation runs here, on team laptops, never on the web host: cleaning, calibration, the synthetic world, models, optimisation, backtests and exports. See `implementation-plan.md` §2–§5.

## Setup

**Windows (PowerShell):**

```bash
py -3.11 -m venv .venv
```

```bash
.venv\Scripts\Activate.ps1
```

```bash
pip install -r pipeline/requirements.txt
```

**macOS / Linux:**

```bash
python3.11 -m venv .venv && source .venv/bin/activate && pip install -r pipeline/requirements.txt
```

Run the commands from the repository root.

## Test

```bash
python -m pytest pipeline
```

- Tests marked `@pytest.mark.data` need the raw files in `Datasets/` (see the root README). When those files are missing, as in CI, the tests **skip automatically**.
- If you own a data part, run the data tests locally and record the result in `PROGRESS.md`.

## Modules, and the part that owns each one

| Module | Part | Purpose |
|---|---|---|
| `config.py` | Phase 4 ✅ | Load `config.yaml`; repository paths |
| `contracts.py` | Phase 4 ✅ | Validate artefacts against `docs/contracts/*.schema.json` |
| `sources.py` | Part 1 ✅ | Registry of every cited source; feeds `meta.json` |
| `artefacts.py` | Part 1 ✅ | Write `web/public/data/*` with the standard header, validated against the contracts; `write_meta()` |
| `ingest.py`, `clean.py` | Part 1 ✅ | Read the raw data; cleaning rules C1–C14 (`docs/03-data-inspection.md` §6) |
| `calibrate.py` | Part 1 ✅ | Write `data/processed/calibration.json` |
| `calendar_uae.py`, `weather.py` | Part 1 ✅ | Build `calendar.json` and `weather.json` from `data/external/*` |
| `geography.py`, `reference.py` | Part 1 ✅ | Places, the 8 fictional supplier routes and `routes.json`; emission factors and shelf lives |
| `world.py`, `generate.py`, `simulate.py`, `fidelity.py` | Part 2 ✅ | The fictional operator and supplier terms; the synthetic UAE world; the hourly engine and P0; the fidelity report (`docs/04`) |
| `recover.py`, `masking.py` | Part 3 ✅ | Demand recovery; the FreshRetailNet-50K masking and forecast-bias tests → `realdata.json` (`docs/05`) |
| `forecast.py`, `spikes.py` | Part 3 ✅ | Nine quantile models, baselines and the KQ2 ablation → `ablation.json`; the spike detector |
| `optimise.py`, `mcdm.py` | Part 4 🟦 | AI policies P1–P3, costs, τ and the surge planner; AHP/entropy/TOPSIS → `mcdm.json` (`docs/06`) |
| `backtest.py`, `impact.py` | Part 4 🟦 | The 200-run Monte Carlo over the 2026 stress windows → `backtest.json`, `frontier.json`; `impact.json` |
| `export.py`, `engine_reference.py` | Part 4 🟦 | Hero `series/*`, `live/feed.json` and `meta.json`; the browser-engine spec and its golden cases |
| `run.py` (CLI) | Parts 1–4 | `--step part1` … `part4`, or one step: `generate`, `simulate`, `fidelity`, `recover`, `realdata`, `forecast`, `ablation`, `spikes`, `mcdm`, `tau`, `backtest [--runs N]`, `export` (full list in the file's docstring) |

**Full rebuild from a fresh clone** (about 35 min; `realdata` skips without `Datasets/FreshRetailNet-50K/`): `python pipeline/run.py --step part2`, then `--step part3`, then `--step part4`. Parts 2–4 need only the committed `calibration.json` and `data/external/*`.

## Rules

- **Configuration.** Read paths and parameters from `config.yaml`; never hard-code them. Changing the config needs a change request.
- **Reproducibility.** Use the seed from `config.yaml` everywhere. The same seed must give the same outputs.
- **Exports.** Every export must pass `freshpipe.contracts.validate_directory()` before you commit it.
- **Provenance.** Label provenance in every exported record.

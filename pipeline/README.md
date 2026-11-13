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
| `config.py` | Phase 4 | Load `config.yaml`; repository paths |
| `contracts.py` | Phase 4 | Validate artefacts against `docs/contracts/*.schema.json` |
| `ingest.py`, `clean.py` | Part 1 | Read the raw data; cleaning rules C1–C14 (`docs/03-data-inspection.md` §6) |
| `calibrate.py` | Part 1 | Write `data/processed/calibration.json` |
| `calendar_uae.py`, `weather.py` | Part 1 | Build `data/external/*`, `calendar.json` and `weather.json` |
| `generate.py`, `simulate.py` | Part 2 | Generate the synthetic UAE world; run the hourly P0 baseline simulation; produce the fidelity report |
| `recover.py`, `forecast.py`, `spikes.py` | Part 3 | Demand recovery, quantile forecasts, spike detection, the masking test and the ablation |
| `optimise.py`, `mcdm.py`, `backtest.py`, `impact.py` | Part 4 | Replenishment policy, the surge planner, AHP/entropy/TOPSIS, Monte Carlo backtests, impact |
| `export.py`, `engine_reference.py` | Part 4 | Write the `web/public/data/*` artefacts and the golden test cases |
| `run.py` (CLI) | Part 1 onward | `python pipeline/run.py --step {clean,calibrate,generate,train,backtest,export,all}` |

## Rules

- **Configuration.** Read paths and parameters from `config.yaml`; never hard-code them. Changing the config needs a change request.
- **Reproducibility.** Use the seed from `config.yaml` everywhere. The same seed must give the same outputs.
- **Exports.** Every export must pass `freshpipe.contracts.validate_directory()` before you commit it.
- **Provenance.** Label provenance in every exported record.

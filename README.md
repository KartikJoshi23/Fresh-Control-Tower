# Fresh Control Tower

[![CI](https://github.com/KartikJoshi23/Fresh-Control-Tower/actions/workflows/ci.yml/badge.svg)](https://github.com/KartikJoshi23/Fresh-Control-Tower/actions/workflows/ci.yml)

**AI replenishment for UAE fresh grocery.** This is Group 1's project for *AI in Operations* (SP Jain School of Global Management, MAIB): a boardroom pitch plus a working prototype. The prototype:
- recovers the demand that stockouts hide;
- forecasts demand as a range;
- decides how much to order and how early (festivals, sudden spikes);
- ranks suppliers under disruption.

> **Academic prototype.**
> - The operator is **fictional**.
> - Synthetic data is **labelled** wherever it appears.
> - No real company results are claimed.

## Start here (every session)

1. **[PROGRESS.md](PROGRESS.md)**: current phase, the exact next step, the task board, decisions and blockers.
2. **[implementation-plan.md](implementation-plan.md)**: the approved plan (v1.1, audited).
3. **[docs/](docs/)**:
   - decision records: [01 problem](docs/01-problem-selection.md), [02 datasets](docs/02-dataset-selection.md), [03 inspection](docs/03-data-inspection.md), [04 synthetic world](docs/04-synthetic-world.md), [05 models](docs/05-models.md), [06 decisions](docs/06-decisions.md);
   - the [design system](docs/design-system.md);
   - the [data contracts](docs/contracts/README.md);
   - [change requests](docs/decisions/README.md).

## Repository map

| Path | What it is | Track |
|---|---|---|
| `web/` | Next.js 16 static-export dashboard (7 pages, global Scenario Console) | B (web) |
| `pipeline/` | Python 3.11: cleaning, calibration, synthetic UAE world, models, optimisation, backtests, exports | A (data/ML) |
| `web/public/data/` | Precomputed artefacts, the only interface between A and B (contracts in `web/src/lib/contracts/`) | A → B |
| `data/` | `external/` (real reference data) and `processed/` (calibration). Generated folders are gitignored. | A |
| `Fresh_Control_Tower_Report.pdf` | The project report (65 pages) | Phase 6 |
| `Fresh_Grocery_AI_Control_Tower.pptx` | The 9-slide presentation deck (built in NotebookLM) | Phase 7 |
| `docs/` | Decision records, design system, contracts, change requests, per-person notes | All |
| `Datasets/` | Raw data (**gitignored**; download it yourself, as below) | A |

## Prerequisites

- Git.
- **Node 22** (see `.nvmrc`).
- **Python 3.11**.
- Optional: LaTeX, or simply use Overleaf.
- Write access to this repository. The lead adds collaborators under GitHub → Settings → Collaborators.

## Quick start

### Dashboard (no raw data needed)

```bash
cd web
npm ci
npm run dev        # http://localhost:3000
npm run check      # lint + typecheck + tests + contract validation + build (run before every PR)
```

### Pipeline

Windows (PowerShell), from the repository root:

```bash
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r pipeline/requirements.txt
python -m pytest pipeline
```

macOS / Linux:

```bash
python3.11 -m venv .venv && source .venv/bin/activate && pip install -r pipeline/requirements.txt && python -m pytest pipeline
```

### Report

The compiled report is [Fresh_Control_Tower_Report.pdf](Fresh_Control_Tower_Report.pdf) and the slides are [Fresh_Grocery_AI_Control_Tower.pptx](Fresh_Grocery_AI_Control_Tower.pptx). The LaTeX source is kept by the lead, outside the repository.

## Raw datasets (not in Git)

You only need these to run the data tests or to re-run Part 1 (calibration). Everything later works from the committed `data/processed/calibration.json`.

```
Datasets/
├── FreshRetailNet-50K/   train.parquet (106.4 MB), eval.parquet (8.4 MB)
├── FreshRetailNet-LT/    train.parquet (315.4 MB), eval.parquet (2.0 MB)
└── Kaggle-Vegetables/    annex1.csv … annex4.csv  (unzipped)
```

| Dataset | Download | Notes |
|---|---|---|
| FreshRetailNet-50K | https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K/tree/main/data | No login needed |
| FreshRetailNet-LT | https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-LT/tree/main/data | No login needed |
| Kaggle vegetables | https://www.kaggle.com/datasets/yapwh1208/supermarket-sales-data | Free Kaggle login; click **Download**, then unzip |

`python -m pytest pipeline` checks the file sizes and checksums for you.

## Working together (summary; the full rules are at the top of PROGRESS.md)

1. **Before you start.** Pull, then read `PROGRESS.md`.
2. **Claim a task.** Claim the next unclaimed task whose dependencies are done: your row only, pushed straight away.
3. **Branch.** Work on a branch named `feat/P<part>-<slug>`.
4. **Commit small and often.** Update `PROGRESS.md` before **every** commit, and push at the end of **every** session.
5. **Frozen items.** Never change the plan, the design system, the data contracts or shared dependencies without a change request (`docs/decisions/`).
6. **Pull requests.** Open a PR when the task meets its definition of done. CI must be green, and the lead merges.
7. **Session prompts.** These are **not** in the repository. The lead shares `COLLABORATOR_PROMPT.md` privately. Paste it into a fresh Claude Code session opened in your clone of this repository.

## Deployment

The site is a pure static export (no server code, no environment variables) and deploys on **Vercel Hobby** (free) from `main`. Settings are in `web/vercel.json`.

1. In Vercel, choose **Add New → Project** and import `KartikJoshi23/Fresh-Control-Tower`.
2. **Root Directory:** `web`. **Framework Preset:** Next.js (detected). Leave the build and output settings at their defaults; `vercel.json` sets `npm ci` and `npm run build`.
3. **Node.js version** (Settings → Build and Deployment): **22.x**, to match `.nvmrc`.
4. **Production branch:** `main`. Every pull request then gets a preview URL.
5. Deploy. Check that every page loads (`/`, `/demand/`, `/scenarios/`, `/live/`, `/sourcing/`, `/impact/`, `/roadmap/`) with no "PLACEHOLDER DATA" banner.

Before pushing changes that affect the site, check them locally from `web/` with `npm run data:validate` and `npm run build` (output in `web/out`, about 10 MB).

## Licences

- Code: [MIT](LICENSE).
- Data and data-derived artefacts: see [DATA_LICENSES.md](DATA_LICENSES.md). The Kaggle data is CC BY-NC-SA 4.0, so derived artefacts are share-alike.

# PROGRESS: Fresh Control Tower

> **Read this file first, every session.** It is the single source of truth for project state.
>
> **Editing rules (they keep merge conflicts rare):**
> 1. Edit only **your own task rows** (owner, status, branch, notes) and **your own subsection** of the session log (§9, append-only).
> 2. Only the lead edits §1 Status and §2 Phase gates. The lead or the decider adds decisions (§4).
> 3. Update this file **after every completed unit of work and before every commit**.
> 4. This file uses git's *union* merge. If a row appears twice after a merge, keep the newer one and delete the older one in your next commit.
> 5. Never put personal contact details here: **the repository is public**.

---

## 1. Status

| Field | Value |
|---|---|
| **Current phase** | Phase 4: repository setup and collaboration kit (**done**; awaiting the lead's review) |
| **Gate** | ⏸ Waiting for the lead's message **"Kit approved, begin development"** |
| **Last completed step** | Phase 4 setup committed: plan audit v1.1, Datasets re-filed, web/pipeline/report scaffolds, 13 contracts + fixtures + JSON Schemas, CI, docs |
| **Exact next step** | The lead reviews `MASTER_PROMPT.md` and `COLLABORATOR_PROMPT.md` (local only). After "Kit approved, begin development": **Part 1** (tasks P1-01…P1-06, Track A). Track B can start **Part 5** (P5-01…) in parallel. |
| **Last integrated commit on `main`** | See the latest entry in §9 (recorded after each push) |
| **Branch** | `main` (initial setup); all Phase 5 work happens on `feat/P<part>-<slug>` branches |
| **Updated** | 2026-11-13 by Kartik (lead), via Claude Code |

## 2. Phase gates

| Phase | Status | Gate phrase (said by the lead) | Date |
|---|---|---|---|
| 1 Problem selection | ✅ Approved | "Problem approved, begin dataset search" | 2026-11-13 |
| 2 Dataset | ✅ Complete | Lead confirmed the datasets are in the root folder | 2026-11-13 |
| 3 Inspection and plan | ✅ Approved (v1.1 after audit) | "Plan approved, begin setup" (given with the repository link) | 2026-11-13 |
| 4 Repository setup and kit | ⏳ Awaiting review | **"Kit approved, begin development"** | — |
| 5 Development (Parts 1–9) | 🔒 Locked until Phase 4 is approved | "continue" after **each** part | — |
| 6 Screenshots and report | 🔒 | "continue" after **each** section | — |
| 7 NotebookLM prompt | 🔒 | Lead's review | — |

## 3. Task board

**Status key:** ⬜ unclaimed · 🟨 in progress · 🟦 in review (pull request open) · ✅ done · ⛔ blocked

**How to claim:**
1. Pull `main`.
2. Pick the **first ⬜ task** (top to bottom) whose dependencies are all ✅, on your track.
3. Edit **only that row**: owner = your name, status = 🟨, branch = `feat/P<part>-<slug>`.
4. Commit `chore(progress): claim <ID>` and push it to `main` **immediately**. This is the only direct-to-main change allowed.
5. Do all the work on your branch.

**Track A = Python pipeline. Track B = web app.** Each task's definition of done (DoD) and file ownership are in `implementation-plan.md` §10.

### Phase 4: setup and kit (done)

| ID | Task | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|
| K-01 | Audit plan v1.0 → v1.1 | Kartik | ✅ | main | 22 findings fixed (plan §17) |
| K-02 | Re-file `Datasets/` into named subfolders; update docs | Kartik | ✅ | main | 50K, LT, Kaggle-Vegetables |
| K-03 | Web scaffold: Next.js 16 static export; all planned dependencies pinned | Kartik | ✅ | main | Build OK; 0 console messages; no overflow at 375 px |
| K-04 | 13 data contracts (Zod, strict) + JSON Schemas + fixtures | Kartik | ✅ | main | 22 Vitest + 8 pytest contract tests |
| K-05 | Pipeline scaffold: config, contract validator, tests | Kartik | ✅ | main | 24 pytest pass (12 raw-data checks run locally) |
| K-06 | LaTeX report skeleton (9 sections = 9 slides) + references | Kartik | ✅ | main | Compiles with pdfLaTeX + Biber |
| K-07 | Docs: design system, contracts, change-request process, progress notes, READMEs | Kartik | ✅ | main | |
| K-08 | CI (GitHub Actions): web + pipeline | Kartik | ✅ | main | e2e runs in CI (Chromium) |
| K-09 | `PROGRESS.md`, licences, `.gitattributes` (LF + union merge) | Kartik | ✅ | main | |
| K-10 | `MASTER_PROMPT.md` + `COLLABORATOR_PROMPT.md` (**local only**, gitignored) | Kartik | ✅ | — | Lead shares them privately |
| K-11 | Initial push to GitHub | Kartik | ✅ | main | |

### Lead-only tasks

| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| L-01 | Add teammates as GitHub collaborators (write access) | Kartik | ⬜ | Settings → Collaborators |
| L-02 | Answer open questions Q1–Q3 and Q5–Q7 (§5) | Kartik | ⬜ | Names are needed to assign owners |
| L-03 | Optional: protect `main` (require pull requests and passing CI) and allow claim commits | Kartik | ⬜ | Only once everyone has the workflow down |
| L-04 | Connect Vercel to the repository (root `web/`) | Kartik | ⬜ | During Part 9 (P9-04) |

### Phase 5, Part 1: data foundation (Track A)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P1-01 | `ingest.py` + `clean.py`: cleaning rules C1–C14, each with a unit test | Kit approved | — | ⬜ | | `docs/03` §6 |
| P1-02 | `calibrate.py` → `data/processed/calibration.json` | P1-01 | — | ⬜ | | Targets: `docs/03` §7 |
| P1-03 | `calendar_uae.py`: festival dates 2023–2026 with an official source per date → `calendar.json` | Kit approved | — | ⬜ | | No date without a source |
| P1-04 | `weather.py`: Open-Meteo daily weather for Dubai, Sharjah and Abu Dhabi → `weather.json` | Kit approved | — | ⬜ | | CC BY 4.0 attribution |
| P1-05 | Reference factors: DESNZ 2025 transport, FoodKeeper shelf life, Poore and Nemecek 2018 food CO2e (verify the ⚠ items) | Kit approved | — | ⬜ | | `data/external/` |
| P1-06 | Places and routes (origins, ports, chokepoints) → `routes.json` | Kit approved | — | ⬜ | | |
| P1-07 | `run.py` CLI (steps: clean, calibrate) | P1-01 | — | ⬜ | | Extended in later parts |

### Phase 5, Part 2: synthetic UAE world (Track A)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P2-01 | `generate.py`: stores, SKUs, true demand (festivals, weather, promotions, spikes), suppliers → `catalog.json` | P1-02, P1-03, P1-04 | — | ⬜ | | Plan §3.4 |
| P2-02 | `simulate.py`: hourly P0 baseline (censoring, ledger, FIFO waste) | P2-01 | — | ⬜ | | Invariant tests |
| P2-03 | Fidelity report vs calibration bands → `fidelity_report.json` | P2-02 | — | ⬜ | | Every band must pass |

### Phase 5, Part 3: models (Track A)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P3-01 | `recover.py`: profile and ML demand recovery | P2-02 | — | ⬜ | | |
| P3-02 | Masking test on real FreshRetailNet-50K data → `realdata.json` | P1-01 | — | ⬜ | | Compare with the paper's −7.37% |
| P3-03 | `forecast.py`: 9 quantile models + baselines (seasonal-naive, MA, ETS) | P3-01 | — | ⬜ | | WAPE, bias, coverage |
| P3-04 | Ablation (KQ2) → `ablation.json` | P3-03 | — | ⬜ | | |
| P3-05 | `spikes.py`: detector + evaluation (delay, false alarms) | P2-02 | — | ⬜ | | |

### Phase 5, Part 4: optimisation, MCDM, backtests, exports (Track A)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P4-01 | `optimise.py`: τ simulation-optimisation + shelf-life guard | P3-03 | — | ⬜ | | Worked newsvendor check |
| P4-02 | Surge planner (known spikes) and unannounced-spike response | P4-01, P3-05 | — | ⬜ | | Plan §4.2–4.3 |
| P4-03 | `mcdm.py`: AHP, entropy, TOPSIS, sensitivity, allocation LP → `mcdm.json` | P1-06 | — | ⬜ | | Reproduce a published TOPSIS example |
| P4-04 | `backtest.py`: Monte Carlo P0–P3 × stress windows → `backtest.json`, `frontier.json` | P4-01, P4-02, P4-03 | — | ⬜ | | 200 runs |
| P4-05 | `impact.py` → `impact.json` | P4-04 | — | ⬜ | | Labelled illustrative |
| P4-06 | `export.py` + `engine_reference.py` + golden cases; `live/feed.json`, `series/*`, `meta.json` | P4-04 | — | ⬜ | | Replaces all fixtures |

### Phase 5, Part 5: web foundation (Track B; can start in parallel with Part 1)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P5-01 | App shell: TopNav (no sidebar; mobile top sheet), layout grid, GlassPanel | Kit approved | — | ⬜ | | `docs/design-system.md` |
| P5-02 | ProvenanceChip + PlaceholderBanner (`isFixture`) | P5-01 | — | ⬜ | | |
| P5-03 | Scenario store (Zustand) + URL sync + Scenario Console drawer + presets | P5-01 | — | ⬜ | | Plan §2.5; Suspense |
| P5-04 | Data loaders (Zod) with loading, empty and error states | P5-01 | — | ⬜ | | |
| P5-05 | Chart primitives: frame, legend, tooltip, table view, status badge | P5-01 | — | ⬜ | | Data-viz rules |

### Phase 5, Parts 6–9: pages (Track B)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P6-01 | Overview page (recommendation, KPI tiles, mini frontier) | P5-01…P5-05 | — | ⬜ | | |
| P6-02 | Hidden Demand Reveal (signature visual) | P5-05 | — | ⬜ | | |
| P6-03 | Demand Lab page (series, festival bands, heat strip, Real-data tab, ablation) | P5-01…P5-05 | — | ⬜ | | |
| P7-01 | TypeScript engine (inventory simulation, Monte Carlo, mulberry32) in a Web Worker | P5-03 | — | ⬜ | | |
| P7-02 | Engine parity tests vs Python golden cases | P7-01, P4-06 | — | ⬜ | | Use fixtures until P4-06 |
| P7-03 | Scenario Studio page + Surge Planner + option table + stock-in/stock-out flow | P7-01 | — | ⬜ | | |
| P8-01 | Live Ops (feed replay, Live Shelf Grid modes, alerts, purchase-order log, approval modes) | P5-01…P5-05 | — | ⬜ | | |
| P8-02 | AHP/entropy/TOPSIS in TypeScript + Rank Race + sensitivity strip | P5-05 | — | ⬜ | | TOPSIS parity |
| P8-03 | Route Globe (R3F, lazy-loaded) + SVG fallback | P8-02 | — | ⬜ | | The only WebGL scene |
| P9-01 | Impact page (Frontier, waterfall, CO2e, food rescue, tornado) | P5-01…P5-05 | — | ⬜ | | |
| P9-02 | Roadmap page (+ Methods and Data tab) | P5-01…P5-05 | — | ⬜ | | |
| P9-03 | QA: e2e on every route and viewport, axe, Lighthouse budgets | P6–P9 | — | ⬜ | | |
| P9-04 | Vercel production deploy | P9-03, L-04 | — | ⬜ | | |

### Phase 6: screenshots and report (lead-gated, one section at a time)

| ID | Task | Depends on | Owner | Status | Notes |
|---|---|---|---|---|---|
| R-00 | Screenshot script + `screenshots/` set (no fixtures) | P9-03, P4-06 | — | ⬜ | Naming: `screenshots/README.md` |
| R-01…R-09 | Report sections 1–9 (= slides 1–9) | R-00 | — | ⬜ | Stop after each section |
| R-10 | Appendices A–E + executive summary + references check | R-09 | — | ⬜ | No `\todophase` left |

### Phase 7: NotebookLM

| ID | Task | Depends on | Owner | Status | Notes |
|---|---|---|---|---|---|
| N-01 | NotebookLM prompt (≤ 500 characters, count stated) + slide-by-slide brief | R-10 | — | ⬜ | |

## 4. Decisions log (append-only; newest last)

| # | Date | Decision | Reason | Reference |
|---|---|---|---|---|
| D-01 | 2026-11-13 | Problem: Candidate A, hidden stockouts in UAE fresh grocery | The only candidate strong on all key questions and on R1–R5 (score 4.85/5) | docs/01 |
| D-02 | 2026-11-13 | Data: FRN-50K + FRN-LT + Kaggle vegetables + a calibrated synthetic UAE layer | No public dataset has a stock ledger, Gulf festivals and suppliers together; synthetic data gives known true demand | docs/02 |
| D-03 | 2026-11-13 | Kaggle is preferred, not mandatory | Lead's message (real data if near-perfect, otherwise near-real synthetic) | docs/02 |
| D-04 | 2026-11-13 | Architecture: offline Python; static Next.js export; browser-only interactivity; Vercel Hobby | Free hosting; the brief bans heavy training on the host | plan §2 |
| D-05 | 2026-11-13 | Methods: profile/ML demand recovery; 9 quantile HGB models; simulation-optimised order-up-to; AHP + entropy + TOPSIS | Explainable to a board; trains on a laptop | plan §3–5 |
| D-06 | 2026-11-13 | Design: dark "night-shift control tower"; validated palette; frozen entity colour mapping | Dataviz validator passes on every chart surface | docs/design-system.md |
| D-07 | 2026-11-13 | Monorepo (`web/`, `pipeline/`, `report/`, `docs/`); raw data gitignored; `calibration.json` committed | Teammates can work without the raw data | plan §7 |
| D-08 | 2026-11-13 | `MASTER_PROMPT.md` and `COLLABORATOR_PROMPT.md` are local-only (gitignored) | Lead's instruction | plan §7 |
| D-09 | 2026-11-13 | Code MIT; data artefacts CC BY-NC-SA 4.0 | Kaggle share-alike; the repository is public | DATA_LICENSES.md |
| D-10 | 2026-11-13 | Next.js 16: `output: 'export'`; Cache Components and partial prefetching **disabled** | Both are server-rendering features (they need the Node.js runtime) | web/next.config.ts |
| D-11 | 2026-11-13 | `@types/node` 22 (not the template's 20) | Vitest 5 requires it, and the runtime is Node 22 | web/package.json |
| D-12 | 2026-11-13 | Plan audit v1.1: 22 fixes | Lead's request | plan §17 |
| D-13 | 2026-11-13 | `PROGRESS.md` uses union merge plus per-person log sections; claim commits go straight to `main` | Fewer merge conflicts; claims become visible at once | .gitattributes |
| D-14 | 2026-11-13 | Every planned web dependency installed and pinned during Phase 4 | Stops parallel parts from editing `package.json` and the lockfile | web/package.json |

## 5. Open questions and blockers

| # | Item | Owner | Needed by | Status |
|---|---|---|---|---|
| Q1 | Presentation and submission dates | Kartik | Phase 5 scheduling | Open |
| Q2 | Group members' names and roles | Kartik | Assigning task owners | Open |
| Q3 | Instructor name and course code (title page) | Kartik | Phase 6 | Open |
| Q5 | Name for the fictional operator (check it is not a real UAE business) | Kartik | P5-01 | Open |
| Q6 | Harvard variant SP Jain expects | Kartik | Phase 6 | Open |
| Q7 | Course policy on acknowledging AI-assisted work | Kartik | Phase 6 | Open |

## 6. Known issues

| # | Issue | Impact | Plan |
|---|---|---|---|
| KI-1 | `npm audit` lists moderate advisories in **dev-only** tooling (for example, the eslint 9 deprecation). Production dependencies: 0 vulnerabilities. | None for users | Review in P9-03 |
| KI-2 | Every file in `web/public/data` is a **fixture** (`isFixture: true`) | Must never appear as results | P5-02 banner; P4-06 replaces them; R-00 guard |
| KI-3 | CI cannot see the raw data, so data tests skip there | CI covers fixtures and logic only | Data part owners run `python -m pytest pipeline` locally and log the result |
| KI-4 | Sources still to verify: *Sustainability* (2026) authors and figures, DESNZ licence, Poore and Nemecek DOI, Ma (2024) initials, AED 6 bn food-waste figure | Must not be cited until checked | P1-05 and Phase 6 |
| KI-5 | `realdata.json` holds Phase 3 inspection numbers; the masking fields are null | None (it is a fixture) | Regenerated in P3-02 |
| KI-6 | `biber --validate-datamodel` warns about 2 undated web sources | None (Harvard "n.d." is intended) | — |

## 7. File ownership map

| Path | Owner | Rule |
|---|---|---|
| `implementation-plan.md`, `docs/design-system.md`, `web/src/styles/tokens.css`, `web/src/lib/contracts/**`, `docs/contracts/**` | Lead | Frozen: change request only |
| `web/package.json`, `web/package-lock.json`, `pipeline/requirements.txt`, `pipeline/config.yaml` | Lead | Change request only |
| `pipeline/freshpipe/{ingest,clean,calibrate,calendar_uae,weather}.py`, `pipeline/run.py`, `data/external/**`, `data/processed/calibration.json` | Part 1 owner | |
| `pipeline/freshpipe/{generate,simulate}.py`, `data/processed/fidelity_report.json` | Part 2 owner | |
| `pipeline/freshpipe/{recover,forecast,spikes}.py` | Part 3 owner | |
| `pipeline/freshpipe/{optimise,mcdm,backtest,impact,export,engine_reference}.py`, `web/public/data/**` (from P4-06), `web/tests/fixtures/golden/**` | Part 4 owner | |
| `web/src/app/layout.tsx`, `web/src/app/globals.css`, `web/src/components/{layout,ui}/**`, `web/src/components/charts/primitives/**`, `web/src/lib/{state,data}/**` | Part 5 owner | |
| `web/src/app/page.tsx`, `web/src/app/demand/**`, `web/src/components/signature/HiddenDemandReveal*` | Part 6 owner | |
| `web/src/app/scenarios/**`, `web/src/lib/engine/**`, `web/src/components/signature/SurgePlanner*` | Part 7 owner | |
| `web/src/app/{live,sourcing}/**`, `web/src/lib/mcdm/**`, `web/src/components/three/**`, `web/src/components/signature/{LiveShelfGrid,RankRace}*` | Part 8 owner | |
| `web/src/app/{impact,roadmap}/**`, `web/src/components/signature/Frontier*`, `web/e2e/**` | Part 9 owner | |
| `report/**`, `screenshots/**` | Lead (Phase 6) | |
| `PROGRESS.md` | Everyone | Own rows and own §9 subsection only |
| `docs/progress/<name>.md` | That person | Append-only |

## 8. Run locally

```bash
# Dashboard (Node 22)
cd web && npm ci && npm run dev          # http://localhost:3000
cd web && npm run check                  # before every pull request

# Pipeline (Python 3.11, from the repository root, inside .venv)
pip install -r pipeline/requirements.txt
python -m pytest pipeline                # data tests run only if Datasets/ is present

# Report: see report/README.md (Overleaf: pdfLaTeX + Biber)
```

## 9. Session log (append-only; one subsection per person; newest entry at the bottom of your own subsection)

Format: `- YYYY-MM-DD · <task ids> · branch <name> · last commit <hash> · <what changed> · next: <next step>`

### Kartik (lead)
- 2026-11-13 · Phases 1–4 (K-01…K-11) · branch main · last commit: recorded in the next line after the push · Problem selected (A); datasets chosen and verified; inspection; plan v1.1 (audited); repository scaffold, contracts, fixtures, CI, docs; prompts local-only · next: lead reviews the kit, then "Kit approved, begin development"

<!-- Teammates: add your own subsection below this line, titled "### <Your first name>", and append only to it. -->

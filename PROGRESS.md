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
| **Current phase** | Phase 5: development. **Parts 1–6 merged into `main`. Parts 7–9 in review in [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) (see KI-18: #6 and #7 merged into stacked branches, not `main`).** All seven pages are built. |
| **Gate** | Lead: review and merge PR #8 into `main`, then connect Vercel (L-04) so P9-04 can deploy. Phase 6 stays locked (§2). |
| **Last completed step** | Part 9 on `feat/P9-impact-roadmap-qa`: Impact and Roadmap pages and the QA sweep. Verified: 139 pytest, 127 Vitest, 41 Playwright e2e (incl. 28 QA: 7 routes × 3 widths + axe), 52/52 data files valid, every route ≤ 248.8 KB gzip initial JS. |
| **Exact next step** | **Lead:** merge PR #8; connect Vercel (L-04) for P9-04; decide CR-001 and CR-002 (§5); answer Q1–Q7. **Then:** Lighthouse on the deploy (KI-19), R-00 screenshots, and Phase 6 (report) once the lead opens it. |
| **Last integrated commit on `main`** | `2ba55e6` (merge of PR #3, which brought in #4 Part 5 and #5 Part 6); earlier: `3d8725e` (PR #2), `b0f26fe` (PR #1), `ff47bb7` (Part 1) |
| **Branch** | `main`. All Phase 5 work happens on `feat/P<part>-<slug>` branches, merged with `--no-ff` via pull requests. Open pull requests with `gh api repos/KartikJoshi23/Fresh-Control-Tower/pulls` (KI-14). |
| **Updated** | 2026-11-15 by Anurag, via Claude Code. §1, the §2 status note, §6 and §7 refreshed factually and flagged to the lead on PR #8; the §2 gate approvals are unchanged. |

## 2. Phase gates

| Phase | Status | Gate phrase (said by the lead) | Date |
|---|---|---|---|
| 1 Problem selection | ✅ Approved | "Problem approved, begin dataset search" | 2026-11-13 |
| 2 Dataset | ✅ Complete | Lead confirmed the datasets are in the root folder | 2026-11-13 |
| 3 Inspection and plan | ✅ Approved (v1.1 after audit) | "Plan approved, begin setup" (given with the repository link) | 2026-11-13 |
| 4 Repository setup and kit | ✅ Approved | "Kit approved" | 2026-11-13 |
| 5 Development (Parts 1–9) | 🟢 Open (Parts 1–6 ✅ merged; Parts 7–9 🟦 PR #8; P9-04 ⛔ L-04) | "continue" after **each** part | 2026-11-13 |
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

**Dependencies:**
- A dependency of **"Kit approved"** is met once §2 shows Phase 4 ✅.
- Any other dependency is met when the task it names is ✅.
- A task marked "use fixtures until …" can start before that task is done.

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
| P1-01 | `ingest.py` + `clean.py`: cleaning rules C1–C14, each with a unit test | Kit approved | Kartik | ✅ | feat/P1-data-foundation (merged `ff47bb7`) | C1-C14 + 15 unit tests; 0 stock-flag mismatches on 12.4M rows |
| P1-02 | `calibrate.py` → `data/processed/calibration.json` | P1-01 | Kartik | ✅ | feat/P1-data-foundation (merged `ff47bb7`) | Reproduces docs/03 numbers (golden tests) |
| P1-03 | `calendar_uae.py`: festival dates 2023–2026 with an official source per date → `calendar.json` | Kit approved | Kartik | ✅ | feat/P1-data-foundation (merged `ff47bb7`) | 31 sourced events; 1,400 days; school windows unverified (KI-7) |
| P1-04 | `weather.py`: Open-Meteo daily weather for Dubai, Sharjah and Abu Dhabi → `weather.json` | Kit approved | Kartik | ✅ | feat/P1-data-foundation (merged `ff47bb7`) | 4,200 real rows (Open-Meteo ERA5) |
| P1-05 | Reference factors: DESNZ 2025 transport, FoodKeeper shelf life, Poore and Nemecek 2018 food CO2e (verify the ⚠ items) | Kit approved | Kartik | ✅ | feat/P1-data-foundation (merged `ff47bb7`) | DESNZ 2025 IDs, FoodKeeper IDs, OWID; ⚠ items verified (KI-4) |
| P1-06 | Places and routes (origins, ports, chokepoints) → `routes.json` | Kit approved | Kartik | ✅ | feat/P1-data-foundation (merged `ff47bb7`) | 8 fictional suppliers on real routes; 3 chokepoints |
| P1-07 | `run.py` CLI (steps: clean, calibrate) | P1-01 | Kartik | ✅ | feat/P1-data-foundation (merged `ff47bb7`) | `--step` clean, calibrate, calendar, weather, routes, meta or part1 |

### Phase 5, Part 2: synthetic UAE world (Track A)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P2-01 | `generate.py`: stores, SKUs, true demand (festivals, weather, promotions, spikes), suppliers → `catalog.json` | P1-02, P1-03, P1-04 | Kartik → Anurag | ✅ | feat/P2-synthetic-world (merged `b0f26fe`, [PR #1](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/1)) | Code done (`world.py`, `generate.py`, catalog.json); anchors met (Ramadan share 19%, 2026 YoY +4.1%). 18 tests (`test_generate_world.py`): worked examples, anchors, same seed = same world, catalog.json regenerates |
| P2-02 | `simulate.py`: hourly P0 baseline (censoring, ledger, FIFO waste) | P2-01 | Kartik → Anurag | ✅ | feat/P2-synthetic-world (merged `b0f26fe`, [PR #1](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/1)) | Code done; ledger invariants asserted in-engine. 11 hand-worked tests (`test_generate_simulate.py`): FIFO, P0 order, deliveries, expiry, censoring |
| P2-03 | Fidelity report vs calibration bands → `fidelity_report.json` | P2-02 | Kartik → Anurag | ✅ | feat/P2-synthetic-world (merged `b0f26fe`, [PR #1](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/1)) | 12/12 bands + 2/2 anchors pass (seeds 2026, 42, 1234, 99). 6 tests (`test_generate_fidelity.py`): committed report reproduces from the seed. Write-up: `docs/04-synthetic-world.md` |

### Phase 5, Part 3: models (Track A)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P3-01 | `recover.py`: profile and ML demand recovery | P2-02 | Anurag | ✅ | feat/P3-models (merged `3d8725e`, [PR #2](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/2)) | Stacked on PR #1. Profile recovery chosen (ML tried: worse). Synthetic test 2026: daily bias −32.4% → −1.5%; hidden-demand WAPE 30.5% (oracle floor 14%; target 25% missed, reported) · 10 tests |
| P3-02 | Masking test on real FreshRetailNet-50K data → `realdata.json` | P1-01 | Anurag | ✅ | feat/P3-models (merged `3d8725e`, [PR #2](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/2)) | `masking.py` → realdata.json (REAL). Masking: hidden WAPE 58.4%, WPE +1.9% (oracle 31.4%). Forecast WPE: raw −18.9% → recovered −0.4% (paper −7.37% → +0.57%) |
| P3-03 | `forecast.py`: 9 quantile models + baselines (seasonal-naive, MA, ETS) | P3-01 | Anurag | ✅ | feat/P3-models (merged `3d8725e`, [PR #2](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/2)) | Stacked on PR #1. 9 HGB quantile models; 2026 test vs true demand: 1-7 d WAPE 30.5% (seasonal-naive 44.4%, MA 36.0%, ETS 34.5%), coverage 77.9%; P50 WPE −5.9%; trained on recorded sales: WPE −31.0% |
| P3-04 | Ablation (KQ2) → `ablation.json` | P3-03 | Anurag | ✅ | feat/P3-models (merged `3d8725e`, [PR #2](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/2)) | ablation.json (not a fixture). ΔWAPE without: stock status +11.9 pts, history only +3.6, calendar +3.0, promotions +1.3, weather 0.0 |
| P3-05 | `spikes.py`: detector + evaluation (delay, false alarms) | P2-02 | Anurag | ✅ | feat/P3-models (merged `3d8725e`, [PR #2](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/2)) | Store level (2026): detection 54%, median delay 3 h, 0.19 false alarms/store-week ✅. Item level: 12% (73% of ≥3× spikes), delay 7 h, 1.1 FA/store-week; censored P0 stream: 4% |

### Phase 5, Part 4: optimisation, MCDM, backtests, exports (Track A)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P4-01 | `optimise.py`: τ simulation-optimisation + shelf-life guard | P3-03 | Anurag | ✅ | merged to `main` via [PR #3](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/3) (`2ba55e6`) | AI order-up-to + shelf-life guard; per-SKU τ on 2025 H2 (out-of-sample forecasts): median 0.85, −12.7% cost vs best single τ; newsvendor CR 0.40 checked |
| P4-02 | Surge planner (known spikes) and unannounced-spike response | P4-01, P3-05 | Anurag | ✅ | merged to `main` via [PR #3](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/3) (`2ba55e6`) | plan_surge (latest safe order, sellable window, split, shortfall, minimum warning) + P2 store-level surge response; worked tests |
| P4-03 | `mcdm.py`: AHP, entropy, TOPSIS, sensitivity, allocation LP → `mcdm.json` | P1-06 | Anurag | ✅ | merged to `main` via [PR #3](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/3) (`2ba55e6`) | mcdm.json: AHP CR 0.025; entropy + TOPSIS reproduce arXiv:2407.09931 Ex. 2 to 6 dp; LP = greedy; CR-002 raised (archetype `local`) |
| P4-04 | `backtest.py`: Monte Carlo P0–P3 × stress windows → `backtest.json`, `frontier.json` | P4-01, P4-02, P4-03 | Anurag | ✅ | merged to `main` via [PR #3](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/3) (`2ba55e6`) | 200 paired runs, 2026: P3 vs P0 lost sales −93.7%, cost −71.6% (lower in 200/200 runs, every window); waste kg +64% (rate 3.2→3.6%); at equal availability AI waste −41% (frontier) |
| P4-05 | `impact.py` → `impact.json` | P4-04 | Anurag | ✅ | merged to `main` via [PR #3](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/3) (`2ba55e6`) | impact.json (illustrative, annualised): cost AED 9.05 M → 2.57 M; waste 93 t → 153 t; CO2e 424 t → 616 t (≈ flat per unit sold); food rescue 9.8 t |
| P4-06 | `export.py` + `engine_reference.py` + golden cases; `live/feed.json`, `series/*`, `meta.json` | P4-04 | Anurag | ✅ | merged to `main` via [PR #3](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/3) (`2ba55e6`) | 40 series files, live/feed.json, meta.json, golden engine_cases.json (24 cases; mulberry32 = JS); 52/52 artefacts valid, 0 fixtures |

### Phase 5, Part 5: web foundation (Track B; can start in parallel with Part 1)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P5-01 | App shell: TopNav (no sidebar; mobile top sheet), layout grid, GlassPanel | Kit approved | Anurag | ✅ | merged to `main` via [PR #4](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/4) → #3 (`2ba55e6`) | TopNav (horizontal only, 64 px, top sheet < 768 px, accent active link), 12-col page grid (max 1440, 16/24 gutters), GlassPanel chart/deco with solid fallback; placeholder pages for the 6 other routes (owners replace) |
| P5-02 | ProvenanceChip + PlaceholderBanner (`isFixture`) | P5-01 | Anurag | ✅ | merged to `main` via [PR #4](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/4) → #3 (`2ba55e6`) | ProvenanceChip (monochrome, glyph + label + tooltip) and PlaceholderBanner (fixture registry: shows if ANY loaded artefact isFixture); e2e proves both states |
| P5-03 | Scenario store (Zustand) + URL sync + Scenario Console drawer + presets | P5-01 | Anurag | ✅ | merged to `main` via [PR #4](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/4) → #3 (`2ba55e6`) | Zustand store + URL codec (short stable keys, clamped, junk ignored) + replaceState sync + Scenario Console drawer (all §2.5 groups, 5 presets, Esc/focus) + active chips; adds `selection.window` (plan §2.5 dateWindow = backtest window ids) |
| P5-04 | Data loaders (Zod) with loading, empty and error states | P5-01 | Anurag | ✅ | merged to `main` via [PR #4](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/4) → #3 (`2ba55e6`) | loadArtefact/loadSeries: fetch → Zod → ok/empty/error (never throws, never logs), cached; DataState panels; contract failure → error panel with zero console errors (e2e) |
| P5-05 | Chart primitives: frame, legend, tooltip, table view, status badge | P5-01 | Anurag | ✅ | merged to `main` via [PR #4](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/4) → #3 (`2ba55e6`) | ChartFrame (title, provenance, legend ≥ 2 series, table toggle + global table view), TableView, ChartTooltip, theme (entity colours, no hue cycling). Initial JS 216 KB gzip (KI-15) |

### Phase 5, Parts 6–9: pages (Track B)

| ID | Task | Depends on | Owner | Status | Branch / PR | Notes |
|---|---|---|---|---|---|---|
| P6-01 | Overview page (recommendation, KPI tiles, mini frontier) | P5-01…P5-05 | Anurag | ✅ | merged to `main` via [PR #5](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/5) → #4 → #3 (`2ba55e6`) | Overview: recommendation (lowest-cost policy for the scenario window), 5 KPI tiles vs baseline with icon+text deltas and P10–P90, Hidden Demand Reveal, mini frontier |
| P6-02 | Hidden Demand Reveal (signature visual) | P5-05 | Anurag | ✅ | merged to `main` via [PR #5](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/5) → #4 → #3 (`2ba55e6`) | HiddenDemandReveal: draggable veil + slider/keyboard, gap shading, live units/AED counter, AI recovered share; on Overview and Demand Lab |
| P6-03 | Demand Lab page (series, festival bands, heat strip, Real-data tab, ablation) | P5-01…P5-05 | Anurag | ✅ | merged to `main` via [PR #5](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/5) → #4 → #3 (`2ba55e6`) | Demand Lab: series (true/recorded/recovered + AI P10–P90, festival shades), legacy-vs-AI forecast toggle with in-browser bias vs truth, stockout strip; Real-data tab (REAL); ablation chart |
| P7-01 | TypeScript engine (inventory simulation, Monte Carlo, mulberry32) in a Web Worker | P5-03 | Anurag | 🟦 | feat/P7-scenario-studio · merged into `feat/P6-overview-demand` by [PR #6](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/6) after #5 had merged, so **not on `main`**; carried to `main` by [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) | `web/src/lib/engine/` (engine.ts port of engine_reference.py, surge.ts port of plan_surge, scenario.ts mapping, Web Worker + main-thread fallback); 5 options × 50 runs ≈ 40–60 ms in Chromium |
| P7-02 | Engine parity tests vs Python golden cases | P7-01, P4-06 | Anurag | 🟦 | feat/P7-scenario-studio · merged into `feat/P6-overview-demand` by [PR #6](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/6) after #5 had merged, so **not on `main`**; carried to `main` by [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) | `tests/engine.test.ts`: all 24 golden cases (deterministic + Monte Carlo), PRNG, Φ⁻¹ within 1e-6; surge worked example shared with the Python test; scenario mapping |
| P7-03 | Scenario Studio page + Surge Planner + option table + stock-in/stock-out flow | P7-01 | Anurag | 🟦 | feat/P7-scenario-studio · merged into `feat/P6-overview-demand` by [PR #6](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/6) after #5 had merged, so **not on `main`**; carried to `main` by [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) | Hero series from the console; P0 vs AI tiles (median of 50 runs, P10–P90 in the table); option table (τ, alternative suppliers); manual stock-in what-if; Surge Planner lanes; e2e in `e2e/pages.spec.ts` |
| P8-01 | Live Ops (feed replay, Live Shelf Grid modes, alerts, purchase-order log, approval modes) | P5-01…P5-05 | Anurag | 🟦 | feat/P8-live-sourcing · merged into `feat/P7-scenario-studio` by [PR #7](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/7), **not on `main`**; carried to `main` by [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) | `app/live/LiveOps.tsx`: simulated clock (play/pause, step, slider, speed in `ui.liveSpeed`), Live Shelf Grid (status / hours-of-cover modes), alert stream, PO log with guardrails vs approve-everything, P2-vs-P1 top-up counter from backtest.json (Hormuz window) |
| P8-02 | AHP/entropy/TOPSIS in TypeScript + Rank Race + sensitivity strip | P5-05 | Anurag | 🟦 | feat/P8-live-sourcing · merged into `feat/P7-scenario-studio` by [PR #7](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/7), **not on `main`**; carried to `main` by [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) | `lib/mcdm/mcdm.ts` (AHP power iteration, entropy, TOPSIS, sensitivity, greedy split) with `tests/mcdm.test.ts`: published example + 4 golden cases from `mcdm_cases.json` (new, written by `run.py --step mcdm`); Rank Race, weights (AHP / entropy / custom), robustness strip for the SKU's pick |
| P8-03 | Route Globe (R3F, lazy-loaded) + SVG fallback | P8-02 | Anurag | 🟦 | feat/P8-live-sourcing · merged into `feat/P7-scenario-studio` by [PR #7](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/7), **not on `main`**; carried to `main` by [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) | `components/signature/RouteGlobe3D.tsx` (R3F + drei Line, lazy via next/dynamic, 248 KB gzip loaded only on /sourcing), flat SVG fallback (no WebGL or reduced motion), one arc hue, dash by mode, ⚠ + critical colour for disrupted legs |
| P9-01 | Impact page (Frontier, waterfall, CO2e, food rescue, tornado) | P5-01…P5-05 | Anurag | 🟦 | feat/P9-impact-roadmap-qa · [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) → `main` | `app/impact/Impact.tsx`: frontier with a draggable marker + slider shared with `policy.serviceTarget`, same-availability readout, cost waterfall, waste/CO2e with the food-rescue toggle, illustrative tornado, KPIs across the six windows; helpers unit-tested |
| P9-02 | Roadmap page (+ Methods and Data tab) | P5-01…P5-05 | Anurag | 🟦 | feat/P9-impact-roadmap-qa · [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) → `main` | `app/roadmap/Roadmap.tsx`: business-model shift with backtest results, three-phase rollout with gates (no invented costs), partner groups, risk register (plan §14.2 + where each mitigation shows); Methods & Data tab: four model cards with honest evidence, provenance legend, 25 Harvard-style sources, KQ2 duplication note |
| P9-03 | QA: e2e on every route and viewport, axe, Lighthouse budgets | P6–P9 | Anurag | 🟦 | feat/P9-impact-roadmap-qa · [PR #8](https://github.com/KartikJoshi23/Fresh-Control-Tower/pull/8) → `main` | `e2e/qa.spec.ts`: 7 routes × 375/768/1440 (no horizontal scroll, no console errors) + axe WCAG 2.1 A/AA (no serious/critical) = 28 tests; `scripts/js-budget.mjs`: every route ≤ 248.8 KB gzip. Lighthouse not run (not a dependency): run by hand on the deploy |
| P9-04 | Vercel production deploy | P9-03, L-04 | — | ⛔ |  | Blocked on L-04: Kartik connects the repository to Vercel (static export in `web/out`, no server code) |

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
| D-15 | 2026-11-13 | CI runs on every branch push (not only `main` and pull requests) | Work is checked before merging, with or without a pull request | .github/workflows/ci.yml |
| D-16 | 2026-11-13 | UAE calendar from timeanddate.com (secondary) plus WAM (official) where found; every row cites its source | No date without a source; official confirmation exists for Ramadan 2026 | data/external/uae_calendar.csv |
| D-17 | 2026-11-13 | Planning shelf lives from USDA FoodKeeper; poultry, dates and bananas are labelled assumptions | FoodKeeper gives consumer storage times; retail receipt-to-expiry differs for these three | data/external/shelf_life.csv |
| D-18 | 2026-11-13 | 8 fictional suppliers on real routes (local, GCC road, sea via Hormuz, Khor Fakkan or Suez, air) | Covers all four archetypes and the three chokepoints in the evidence | pipeline/freshpipe/geography.py |
| D-19 | 2026-11-13 | Vegetable time stamps are parsed in two formats | The 132 "unparseable" stamps are valid times without milliseconds | docs/03 §6 C10 |
| D-20 | 2026-11-13 | The Hormuz shock is modelled through availability and lead times, not prices | Goharbakhsh et al. (2026) find food-price effects statistically insignificant (p > 0.05) | calibration.json anchors |
| D-21 | 2026-11-14 | P0 covers L + R − 1 days (22:00 review, 06:00 dawn delivery) with a weekday-aware 28-day moving average | The night between review and delivery carries almost no demand; same-weekday averages match the legacy practice | docs/04 §5 (decided by Kartik) |
| D-22 | 2026-11-14 | P0 adds a shrink allowance, a one-case presentation minimum and a flat +25% promotion uplift; the buffer stays at 20%. A 9th supplier, `sup-local-bakery` (archetype `local`), is added | Fixes the zero-sales trap of a pure moving average; bakery is a daily local delivery | docs/04 §4–5 (decided by Kartik) |
| D-23 | 2026-11-14 | Spike bands are checked on true demand (recorded sales shown alongside); the spoilage band applies to the two vegetable categories only | Spikes are a demand property the festival-blind P0 caps; real loss data covers vegetables only | docs/04 §6 (decided by Kartik) |

## 5. Open questions and blockers

| # | Item | Owner | Needed by | Status |
|---|---|---|---|---|
| Q1 | Presentation and submission dates | Kartik | Phase 5 scheduling | Open |
| Q2 | Group members' names and roles | Kartik | Assigning task owners | Open |
| Q3 | Instructor name and course code (title page) | Kartik | Phase 6 | Open |
| Q5 | Name for the fictional operator (check it is not a real UAE business) | Kartik | P5-01 | Open |
| Q6 | Harvard variant SP Jain expects | Kartik | Phase 6 | Open |
| Q7 | Course policy on acknowledging AI-assisted work | Kartik | Phase 6 | Open |
| CR-001 | `series.ts`: the `waste` comment should read "quality culls on receipt plus expiry" (comment only, no schema change) | Kartik (approve) | P4-06 | Proposed: `docs/decisions/CR-001-series-waste-definition.md` |
| CR-002 | `mcdm.ts`: rename archetype `local_farm` → `local` (the bakery is not a farm; D-22) | Kartik (approve) | P8-02 | Proposed: `docs/decisions/CR-002-mcdm-archetype-local.md` |

## 6. Known issues

| # | Issue | Impact | Plan |
|---|---|---|---|
| KI-1 | `npm audit` lists moderate advisories in **dev-only** tooling (for example, the eslint 9 deprecation). Production dependencies: 0 vulnerabilities. | None for users | Review in P9-03 |
| KI-2 | ✅ Resolved in P4-06 (PR #3): every file in `web/public/data` is now pipeline output (`isFixture: false`, 52/52 valid). | — | Keep the PlaceholderBanner (P5-02) and the R-00 guard as safety nets |
| KI-3 | CI cannot see the raw data, so data tests skip there | CI covers fixtures and logic only | Data part owners run `python -m pytest pipeline` locally and log the result |
| KI-4 | ✅ Verified in Part 1: *Sustainability* (2026) authors (Goharbakhsh, Rahbari, Aghabayk) and the −95.1% figure (abstract via Crossref); DESNZ OGL v3.0; Poore and Nemecek DOI; Ma (2024) = Mingpu Ma; AED 6 bn = 2022 statement by the UAE minister (Khaleej Times) | Resolved | — |
| KI-5 | ✅ Resolved in P3-02 (PR #2): `realdata.json` is regenerated from code with the masking and forecast-bias results | — | — |
| KI-6 | `biber --validate-datamodel` warns about 4 undated web sources | None (Harvard "n.d." is intended) | — |
| KI-7 | School summer-break windows (2023–2026) come from news reports (`verified = false`) | Timing of a synthetic demand pattern only | Check against MoE calendars before the report cites them |
| KI-8 | FoodKeeper's server refuses scripted downloads (HTTP 403) | Shelf-life values were read in a browser and recorded with product IDs | Re-check by hand if FoodKeeper updates |
| KI-9 | ✅ Resolved: since Part 2, pull requests are opened through the GitHub REST API (see KI-14), and the lead merges them on GitHub | — | — |
| KI-10 | `--step realdata` (P3-02) needs `Datasets/FreshRetailNet-50K/` (115 MB, from Hugging Face, no login). The data-marked reproduction test also needs FRN-LT and Kaggle (`conftest.py` checks all raw files) | Without them the step skips and keeps the committed `realdata.json` | Re-run with all datasets locally before the report freezes the numbers |
| KI-11 | Slow steps: `--step backtest` (200 Monte Carlo runs) takes about 22 min; `--step part4` about 25 min; `--step part3` about 7 min | None | Use `--runs 2` for a quick preview; commit only the 200-run outputs |
| KI-12 | `live/feed.json` is 1.25 MB raw (72 KB gzipped); the series files are about 145 KB each (17 KB gzipped) | Page weight on `/live` | P8-01 loads it lazily on `/live` only; trim the window if LCP misses its budget |
| KI-13 | **Honest results to carry into the report:** recovery WAPE 30.5% vs the 25% target; item-level spike delay 7 h vs ≤ 4 h (store level meets it); under the AI, absolute waste kg is +64% and CO2e +45%, because it serves 30 points more demand (waste per kg received is about flat; at equal availability waste is −41%) | Phase 6 must not overclaim | `docs/05-models.md` §1 and `docs/06-decisions.md` §1 and §4 give the wording and the numbers |
| KI-14 | GitHub GraphQL is blocked from Claude Code sessions, so `gh pr create` fails | — | `gh api repos/KartikJoshi23/Fresh-Control-Tower/pulls -f title=… -f head=… -f base=main -F body=@file` |
| KI-15 | Shell initial JS is 216 KB gzip per route (React + Next.js about 155 KB, Zod + shell about 45 KB) against a 250 KB target and a 300 KB hard limit (plan §6.6) | Recharts on a page would exceed the target | Parts 6–9: prefer custom SVG with `d3-scale`/`d3-shape` (pinned); lazy-load Recharts (`next/dynamic`) below the fold; measure with the gzip check in P9-03 |
| KI-16 | `@react-three/fiber` 9.8 logs a console WARNING on `/sourcing` with three 0.187 ("THREE.Clock … deprecated, use THREE.Timer") | Console is clean of errors, not of this warning | Wait for an R3F release that uses `THREE.Timer` (dependency bump needs a change request: `package.json` is frozen) |
| KI-17 | The top bar overflowed at 768 px (seven links + brand + Scenario button need about 1000 px) | Fixed in P8: links move to the menu sheet below 1024 px | e2e now checks 768 px too (P9-03) |
| KI-18 | PRs #4–#7 were stacked and merged into their base branches in an order that left Parts 7–8 on `feat/P6-overview-demand`, not `main` (#5 merged before #6 brought them in) | `main` lacked the Scenario Studio, Live Ops and Sourcing | PR #8 (from `feat/P9-impact-roadmap-qa`, which includes Parts 7–9 and `main`) targets `main` directly. For future stacks: merge the bottom PR into `main` first, then retarget the next one to `main` before merging it |
| KI-19 | Lighthouse budgets (plan §6.6) are not automated: Lighthouse is not a dependency and `package.json` is frozen | Performance is checked through the JS budget script and the e2e suite only | Run Lighthouse in Chrome DevTools on the Vercel deploy (P9-04) and record the scores in §9 |

## 7. File ownership map

| Path | Owner | Rule |
|---|---|---|
| `implementation-plan.md`, `docs/design-system.md`, `web/src/styles/tokens.css`, `web/src/lib/contracts/**`, `docs/contracts/**` | Lead | Frozen: change request only |
| `web/package.json`, `web/package-lock.json`, `pipeline/requirements.txt`, `pipeline/config.yaml` | Lead | Change request only |
| `pipeline/freshpipe/{ingest,clean,calibrate,calendar_uae,weather}.py`, `pipeline/run.py`, `data/external/**`, `data/processed/calibration.json` | Part 1 owner | `run.py`: each later part adds only its own `step_*` functions and its `PART<n>` tuple |
| `pipeline/freshpipe/{world,generate,simulate,fidelity}.py`, `data/processed/fidelity_report.json`, `pipeline/tests/test_generate*.py`, `docs/04-synthetic-world.md` | Part 2 owner (Kartik → Anurag) | `simulate.py` also has the P2/P3 same-day top-up channel (Part 4); P0 must stay bit-identical (golden test) |
| `pipeline/freshpipe/{recover,masking,forecast,spikes}.py`, `pipeline/tests/test_models*.py`, `data/processed/model_report.json` (shared by Parts 3–4, one section per step), `docs/05-models.md` | Part 3 owner (Anurag) | |
| `pipeline/freshpipe/{optimise,mcdm,backtest,impact,export,engine_reference}.py`, `pipeline/tests/test_decisions.py`, `web/public/data/**` (from P4-06), `web/tests/fixtures/golden/**`, `docs/06-decisions.md` | Part 4 owner (Anurag) | `engine_reference.py` is the spec the Part 7 TypeScript engine must match (golden cases, 1e-6) |
| `web/src/app/layout.tsx`, `web/src/app/globals.css`, `web/src/components/{layout,ui}/**`, `web/src/components/charts/primitives/**`, `web/src/lib/{state,data}/**` | Part 5 owner | |
| `web/src/app/page.tsx`, `web/src/app/demand/**`, `web/src/components/signature/HiddenDemandReveal*` | Part 6 owner | |
| `web/src/app/scenarios/**`, `web/src/lib/engine/**`, `web/src/components/signature/SurgePlanner*` | Part 7 owner | |
| `web/src/app/{live,sourcing}/**`, `web/src/lib/mcdm/**`, `web/src/components/three/**`, `web/src/components/signature/{RouteGlobe*,routeGeometry.ts}`, `web/tests/mcdm.test.ts`, `web/tests/fixtures/golden/mcdm_cases.json`, `web/src/components/signature/{LiveShelfGrid,RankRace}*` | Part 8 owner | |
| `web/src/app/{impact,roadmap}/**`, `web/src/components/signature/Frontier*`, `web/e2e/**`, `web/scripts/js-budget.mjs` | Part 9 owner | |
| `report/**`, `screenshots/**` | Lead (Phase 6) | |
| `PROGRESS.md` | Everyone | Own rows and own §9 subsection only |
| `docs/progress/<name>.md` | That person | Append-only |
| `docs/decisions/CR-*.md` | The person who raised it; the lead records the decision | |

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
- 2026-11-13 · Phases 1–4 (K-01…K-11) · branch main · last commit 0f12d2b (7 setup commits, 446c4d2…0f12d2b) · Problem selected (A); datasets chosen and verified; inspection; plan v1.1 (audited); repository scaffold, contracts, fixtures, CI, docs; prompts local-only · next: lead reviews the kit, then "Kit approved, begin development"

- 2026-11-13 · Phase 5 gate · branch main · last commit 206ddee · Kit approved by the lead; P1-01…P1-07 claimed · next: build Part 1 on feat/P1-data-foundation

- 2026-11-13 · P1-01…P1-07 · branch feat/P1-data-foundation · Part 1 built and verified: 70 pytest pass; cleaning counts and calibration reproduce docs/03; real calendar, weather and routes artefacts pass both contracts · next: merge, then wait for "continue" (Part 2)

- 2026-11-13 · P1-01…P1-07 · branch main · last commit ff47bb7 (merge of feat/P1-data-foundation, 8 commits bdbec98…350a293) · Part 1 merged with --no-ff after branch CI passed; rows set to ✅ · next: wait for "continue", then Part 2 on feat/P2-synthetic-world

- 2026-11-13 · Part 2 gate · branch main · last commit 950917d · "continue" given by the lead; P2-01…P2-03 claimed · next: build Part 2 on feat/P2-synthetic-world

- 2026-11-14 · P2-01…P2-03 · branch feat/P2-synthetic-world · Part 2 code pushed (tests/docs pending). Decisions to log: D-21 P0 coverage = L+R−1 days (22:00 review, 06:00 dawn delivery), weekday-aware 28-day MA; D-22 P0 adds shrink allowance, 1-case presentation minimum (fixes zero-sales trap) and flat +25% promo uplift, buffer stays 20%; D-23 spike bands checked on true demand (recorded sales shown alongside); spoilage band applied to vegetable categories only; added sup-local-bakery (9 suppliers, archetype 'local'). Waste = expiry + quality culls (series.ts comment to update) · next: tests, docs/04, merge

<!-- Teammates: add your own subsection below this line, titled "### <Your first name>", and append only to it. -->

### Anurag
- 2026-11-14 · P2-01…P2-03 · branch feat/P2-synthetic-world · continuing Kartik's Part 2 WIP (a6e80fc); baseline green (web check ✅, 58 pytest + 12 skips) · 35 Part 2 tests added (93 pytest pass); `--step part2` reproduces the committed artefacts bit-for-bit (only `generatedAt` differs) · next: docs/04-synthetic-world.md, log D-21…D-23, CR-001 (series.ts waste comment), PR
- 2026-11-14 · P2-01…P2-03 · branch feat/P2-synthetic-world · last commit 15d3a6d · docs/04 written; D-21…D-23 logged; CR-001 raised; checks green (93 pytest, web check); PR #1 opened, rows 🟦 · next: lead reviews and merges PR #1; meanwhile Part 3 on feat/P3-models, stacked on the Part 2 branch
- 2026-11-14 · P3-01, P3-02 · branch feat/P3-models · recover.py + masking.py + run steps `recover`, `realdata`; realdata.json regenerated from code (not a fixture); 104 pytest pass · next: forecast.py (P3-03), ablation (P3-04), spikes.py (P3-05)
- 2026-11-14 · P3-03…P3-05 · branch feat/P3-models · forecast.py (9 quantile models, baselines, ablation), spikes.py, run steps forecast/ablation/spikes; ablation.json generated; 121 pytest pass · next: docs/05-models.md, PR for Part 3
- 2026-11-14 · P3-01…P3-05 · branch feat/P3-models · last commit 520696e · docs/05-models.md; PR #2 opened (stacked on PR #1); rows 🟦 · next: Part 4 (P4-01…P4-06) on feat/P4-decisions, stacked on feat/P3-models
- 2026-11-14 · P2-01…P2-03 · branch main · last commit b0f26fe (merge of PR #1 by Kartik) · Part 2 rows set to ✅ · next: PR #2 (Part 3) retargeted to main
- 2026-11-14 · P4-01…P4-06 (WIP) · branch feat/P4-decisions · optimise.py (P1-P3 policies, costs, newsvendor, surge planner), mcdm.py (AHP CR 0.025; entropy + TOPSIS reproduce arXiv:2407.09931 Ex. 2 to 6 dp), backtest.py, impact.py, export.py, engine_reference.py (mulberry32 bit-identical to JS); simulate.py gains the noon top-up channel (P0 unchanged); 52/52 artefacts valid, 0 fixtures; backtest.json/frontier.json/impact.json are a 2-run preview · next: commit the 200-run Monte Carlo, docs/06-decisions.md, PR
- 2026-11-14 · P3-01…P3-05 · branch main · last commit 3d8725e (merge of PR #2 by Kartik) · Part 3 rows set to ✅ · next: PR #3 (Part 4) retargeted to main
- 2026-11-14 · P4-01…P4-06 · branch feat/P4-decisions · last commit 36fa5ba · Part 4 complete: 200-run backtests, frontier, impact, 40 series, live feed, golden cases; docs/06; CR-002; 138 pytest + 61 vitest pass, 52/52 artefacts valid, 0 fixtures; PR #3 opened, rows 🟦 · next: lead merges PR #3; then Part 5 (P5-01 app shell: TopNav, layout grid, GlassPanel) on feat/P5-web-foundation — build against the real artefacts (no fixtures remain)
- 2026-11-14 · docs sync · branch main · refreshed §1 Status, the §2 status note (approvals unchanged), §6 (KI-2/5/9 resolved; KI-10…KI-14 added) and §7 (new Part 2–4 files) after Parts 2–3 merged; handover in docs/progress/anurag.md; flagged to the lead on PR #3 · next: claim P5-01
- 2026-11-14 · P5-01…P5-05 · branch feat/P5-web-foundation · last commit 5d1cc92 · Part 5 done: shell (TopNav, grid, GlassPanel), Scenario Console + URL sync (adds selection.window), Zod loaders + DataState, ProvenanceChip + PlaceholderBanner, chart primitives; 6 placeholder routes; 74 Vitest + 8 e2e pass; JS 216 KB gzip (KI-15); PR #4 opened (stacked on #3), rows 🟦 · next: lead merges #3 then #4 (retarget #4 to main after #3); then Part 6 (Overview + Demand Lab, Hidden Demand Reveal) on feat/P6-overview-demand
- 2026-11-14 · P6-01…P6-03 · branch feat/P6-overview-demand · Overview + Demand Lab + Hidden Demand Reveal, d3/SVG chart kit; 78 Vitest + 10 e2e; PR #5 (stacked on #4), rows 🟦 · next: Part 7 (TS engine port + parity, Scenario Studio, Surge Planner) on feat/P7-scenario-studio
- 2026-11-15 · P7-01…P9-03 · branch feat/P9-impact-roadmap-qa · found Parts 7–8 merged into stacked branches but not `main` (KI-18); P9 branch = P8 + `main` + Part 9 (Impact, Roadmap + Methods & Data, QA sweep, axe, js-budget); 139 pytest, 127 Vitest, 41 e2e, 52/52 valid; PR #8 → `main` · next: lead merges #8, connects Vercel (P9-04), Lighthouse on the deploy

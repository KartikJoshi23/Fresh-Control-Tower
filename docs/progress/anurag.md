# Session notes: Anurag

## 2026-11-14 · P2-01…P4-06 · feat/P2-synthetic-world, feat/P3-models, feat/P4-decisions

### Where things stand (end of session 1)

| Part | State | Pull request | Write-up |
|---|---|---|---|
| 2: synthetic UAE world, P0, fidelity | ✅ merged (`b0f26fe`) | #1 | `docs/04-synthetic-world.md` |
| 3: recovery, real-data test, forecasts, ablation, spikes | ✅ merged (`3d8725e`) | #2 | `docs/05-models.md` |
| 4: AI policies, MCDM, backtests, impact, exports | 🟦 in review, CI green | #3 | `docs/06-decisions.md` |

Track A (Python) is complete. All 52 dashboard data files are real pipeline output, and **no fixtures remain**.

### Numbers the team will quote (all CALIBRATED SYNTHETIC unless marked REAL)

- **Hidden demand.** Under the legacy rule, 22.1% of true demand is lost (32.4% in 2026). Recovery cuts the history's bias from −32.4% to −1.5%.
- **Real data (FreshRetailNet-50K).** A forecast trained on raw sales has WPE **−18.9%**; trained on recovered demand, **−0.4%**. The paper reports −7.37% → +0.57% with its own protocol. *(REAL)*
- **Forecast, 1–7 days, 2026.** WAPE 30.5%, vs ETS 34.5%, the 28-day MA 36.0% and seasonal-naive 44.4%. The P10–P90 band covers 77.9%.
- **KQ2.** Stock status matters most: +11.9 pts WAPE without it. Then calendar (+3.0) and promotions (+1.3); weather adds nothing (0.0).
- **Spikes.** Store level: 54% detected, 3 h median delay, 0.19 false alarms per store-week. Item level: 7 h. On a censored shelf, detection is 4% (an argument for KQ3).
- **Backtest, 200 runs, P3 vs P0, 2026:**
  - lost sales −93.7%;
  - total cost −71.6%, lower in every run and every window;
  - availability 69.4% → 97.7%;
  - waste kg +64%, while waste per kg received is about flat;
  - at equal availability, waste is −41% (frontier).
- **Impact (illustrative, annualised).** Cost AED 9.05 M → 2.57 M; CO2e 424 t → 616 t (about flat per unit sold); food rescue 9.8 t.

### Targets missed (do not overclaim; see KI-13)

- Synthetic recovery WAPE: 30.5% vs the 25% target. The noise floor is about 14% for hidden demand and about 60% hour by hour.
- Item-level spike detection: 7 h vs ≤ 4 h.
- "Waste −20% at the same time as lost sales −30%" holds only at equal availability, not in absolute kg.

### Decisions and change requests

- **D-21 to D-23** were logged from Kartik's Part 2 notes.
- **CR-001** (proposed): the `series.waste` comment should read quality culls + expiry.
- **CR-002** (proposed): MCDM archetype `local_farm` → `local`. Until then the bakery is labelled `local_farm` in `mcdm.json`.
- **Not frozen-file changes, but worth knowing:**
  - `simulate.py` gained a same-day top-up channel (used by P2/P3; P0 is bit-identical);
  - `run.py` gained steps for Parts 2–4;
  - one line in `web/tests/contracts.test.ts` was generalised, because it assumed the all-ones fixture AHP matrix.

### How to reproduce

```bash
python pipeline/run.py --step part2      # about 15 s
python pipeline/run.py --step part3      # about 7 min; realdata needs Datasets/FreshRetailNet-50K/
python pipeline/run.py --step part4      # about 25 min (200 Monte Carlo runs); --step backtest --runs 2 to preview
python -m pytest pipeline                # 138 passed, 13 skipped without the raw data
cd web && npm run check                  # lint, types, 61 Vitest tests, 52/52 contracts, build
```

### Verification highlights

- **Published TOPSIS + entropy example reproduced to 6 dp:** arXiv:2407.09931, ch. 15, Ex. 2.
- **mulberry32 is bit-identical to JavaScript** (Node 22, 4 seeds); Φ⁻¹ (Acklam) is within 3e-9 of SciPy.
- **Golden checks.**
  - The fidelity report, the recovery report and the engine golden cases all reproduce from code.
  - There is a leakage test for every forecast bucket.

### Tips for the next person

- **Pull requests.** GraphQL is blocked here, so open them with `gh api repos/KartikJoshi23/Fresh-Control-Tower/pulls … -F body=@file` (KI-14).
- **Stacking.** Stack a branch on an open one and retarget it to `main` after the merge (`gh api -X PATCH …/pulls/<n> -f base=main`).
- **Part 7.** Its TypeScript engine must match `pipeline/freshpipe/engine_reference.py` (the docstring is the spec) on `web/tests/fixtures/golden/engine_cases.json` within 1e-6.
- **Data sizes.** `live/feed.json` is large (KI-12); load it on `/live` only.

### Next

The lead merges PR #3. Then **Part 5** (web foundation) on `feat/P5-web-foundation`, starting with P5-01: the app shell, TopNav (no sidebar), the layout grid and GlassPanel.

## 2026-11-14 · docs sync + P5-01…P5-05 · main, feat/P5-web-foundation

- **Docs sync (on `main`, with Anurag's go-ahead; flagged to Kartik on PR #3):**
  - §1 Status refreshed;
  - the §2 status note updated (approvals unchanged);
  - KI-2, KI-5 and KI-9 resolved; KI-10 to KI-14 added;
  - §7 ownership map extended;
  - README and `pipeline/README.md` indexes updated.
- **Part 5 is in PR #4**, stacked on #3. It is built against the real artefacts.
  - **Shell.** TopNav (no sidebar, top sheet below 768 px), the grid and GlassPanel.
  - **Scenario.** Zustand store with a URL mirror (`replaceState`; no Suspense needed, because it reads `window.location` in effects) and the Scenario Console with the five presets.
  - **Data.** Zod loaders with ok/empty/error, plus the fixture banner.
  - **Charts.** ChartFrame, TableView and the colour theme.
- **Design additions:**
  - `selection.window`, using the backtest window ids, so the "Ramadan 2026" preset differs from "Normal";
  - six `PagePlaceholder` routes, so nav prefetches don't 404 and log console errors.
- **Checks:** 74 Vitest + 8 Playwright pass. Initial JS is 216 KB gzip (KI-15: chart-heavy pages should use d3 + SVG or lazy Recharts).
- **Next:** Part 6. Overview (recommendation, KPI tiles from `backtest.json`, mini frontier) and Demand Lab (series chart, the Hidden Demand Reveal, the Real-data tab, the ablation chart).

## 2026-11-14/15 · P6-01…P9-03 · feat/P6-overview-demand → feat/P9-impact-roadmap-qa

- **Part 6 (PR #5, merged to `main`).** Overview (recommendation, KPI tiles, mini frontier) and Demand Lab (Hidden Demand Reveal, bias readout, real-data and ablation tabs) on a small d3 + SVG chart kit (`components/charts/svg`), to stay inside the JS budget.
- **Part 7 (PR #6).** `web/src/lib/engine/engine.ts` ports `engine_reference.py`; all 24 golden cases (deterministic and Monte Carlo), the PRNG and Φ⁻¹ match Python within 1e-6. It runs in a Web Worker (main-thread fallback). Scenario Studio: P0 vs AI tiles, option table, stock flow, manual stock-in, Surge Planner (`surge.ts` ports `plan_surge`, same worked example as the Python test).
  - Finding worth reporting: under a known spike, τ 0.95 beats the backtest-tuned τ 0.75. The table shows it.
- **Part 8 (PR #7).** Live Ops replays the simulated feed (clock, shelf grid, alerts, PO log, noon top-up counter). Sourcing: `lib/mcdm` (AHP, entropy, TOPSIS, sensitivity) with parity against the published example and the new `mcdm_cases.json`; Rank Race; robustness strip for the SKU's pick; Route Globe (lazy R3F, flat SVG fallback).
- **Part 9 (PR #8 → `main`).** Impact (frontier with a draggable marker, waterfall, waste/CO2e with food rescue, illustrative tornado, KPIs across windows) and Roadmap (business-model shift, phases with gates, partners, risk register, Methods & Data with sources). Live Ops now has the three approval modes from the plan (auto within guardrails / approve exceptions / manual).
- **QA.** `e2e/qa.spec.ts`: every route at 375/768/1440 px with no horizontal scroll and no console errors, plus axe (WCAG 2.1 A/AA) with no serious or critical issues. Fixes found by it: the top bar overflowed at 768 px (links now move to the menu below 1024 px), the brand link's label did not match its text, scrolling tables were not keyboard-focusable, and a screen-reader-only span escaped the shelf grid's scroll box.
- **Merge order problem (KI-18).** PRs #6 and #7 were merged into their stacked base branches after #5 had already merged, so Parts 7–8 never reached `main`. PR #8 targets `main` directly and carries Parts 7–9.
- **Checks:** 139 pytest, 127 Vitest, 41 Playwright, 52/52 data files valid; every route ≤ 248.8 KB gzip initial JS (`node web/scripts/js-budget.mjs`).
- **Blocked / not done:** P9-04 deploy waits for Vercel (L-04). Lighthouse is not automated (KI-19). R-00 screenshots are unclaimed. KI-16: R3F logs a THREE.Clock deprecation warning (not an error) on `/sourcing`.
- **Next:** the lead merges PR #8 and connects Vercel; then Lighthouse on the deploy, R-00 screenshots, and Phase 6 when the lead opens it.

## 2026-11-15 · final verification · fix/verify-live

- **State found:** Kartik merged PR #8 (Parts 7–9) and PR #9 (CR-003 Neon Noir UI) and connected Vercel; the site is live at https://fresh-control-tower.vercel.app/. My task rows P7–P9 were still 🟦 and §1 still described PR #9 as waiting.
- **`main` (`16d8946`):** 139 pytest, 127 Vitest, 41 Playwright e2e, 52/52 data files valid; initial JS 221.5–254.5 KB gzip (KI-21: six routes slightly over the 250 KB target, all under the 300 KB limit).
- **Live site:** the same 41 e2e tests (pages, QA sweep, axe) pass against the deploy (`web/playwright.live.config.ts`, new). All seven routes: 0 failed requests, 0 console errors (only the known KI-16 warning on `/sourcing`). Data served gzipped with the 1-hour cache from `vercel.json`.
- **Lighthouse (KI-19):** desktop 99–100 on five routes; mobile 86–92; accessibility 98–100; best practices and SEO 100. Two weak spots: `/demand` desktop CLS 0.52 and `/sourcing` blocking time (the globe kept rendering off screen).
- **Fixed in PR #10 (KI-22):** charts briefly rendered at a 640 px fallback width and widened the Overview by 178 px (the cause of an intermittent e2e failure); the scrollbar appearing after data loads shifted the page (CLS); the globe now renders only while on screen; chart titles are `h2` (heading order). Re-measured on the local build: CLS 0.008, `/sourcing` blocking 60 ms desktop, accessibility 100.
- **Next:** the lead merges PR #10; re-run Lighthouse on the live `/demand` and `/sourcing`; R-00 screenshots and Phase 6 when the lead opens it.

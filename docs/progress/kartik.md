# Session notes: Kartik (lead)

## 2026-11-13 · Phases 1–4 · main

### Phase 1: problem selection
- Four candidates were researched and scored.
- **Candidate A was selected (4.85/5):** hidden stockouts in UAE fresh grocery (festivals, sudden spikes, the 2026 Hormuz disruption).
- Record: `docs/01-problem-selection.md`.

### Phase 2: datasets
- Chosen: FreshRetailNet-50K (Hugging Face) and the Kaggle "Supermarket Sales Data" vegetables set, plus a near-real synthetic UAE layer.
- FreshRetailNet-LT was downloaded at the lead's request; its SHA-256 checksums were verified.
- Record: `docs/02-dataset-selection.md`.

### Phase 3: inspection and plan
- `hours_stock_status` uses **1 = OUT of stock**. This was verified at 100% against `stock_hour6_22_cnt`.
- 19.9–22.2% of trading hours are out of stock.
- Morning demand is 22–46% higher on days that later sold out.
- Real spikes reach 5.13× the rolling median.
- Retail is about 1.66× wholesale, and spoilage is 9.9% (kg-weighted).
- Records: `docs/03-data-inspection.md` and `implementation-plan.md`.

### Phase 4: setup and kit
- **Plan audit (v1.0 → v1.1).** 22 findings were fixed: 3 bugs (glass surface, mixed status/diverging colours, globe colour cap), 1 formula error (earliest useful arrival), and gaps in static export, CI raw data, fixtures and PRNG parity. See plan §17.
- **Datasets.** Re-filed into `Datasets/FreshRetailNet-50K/`, `Datasets/FreshRetailNet-LT/` and `Datasets/Kaggle-Vegetables/`.
- **Web.**
  - Next.js 16.4.6 static export.
  - Every planned dependency pinned up front, so later parts don't edit `package.json` in parallel.
  - Cache Components and partial prefetching disabled: they are server-rendering features.
  - `@types/node` 22, because Vitest 5 needs it.
- **Contracts.** 13 Zod contracts (strict) with cross-field rules, exported as JSON Schemas and validated in both languages. There are 13 fixtures, all with `isFixture: true`.
- **Verification:**
  - web: 22 Vitest tests pass; lint is clean; typecheck and build pass. In the browser, the static export has zero console messages and no overflow at 375 px.
  - pipeline: 24 pytest tests pass, including 12 raw-data checks run locally.
  - report: the LaTeX skeleton compiles (pdfLaTeX + Biber) with no errors.
- **Bug found and fixed while scaffolding.** A Python escape turned `\todophase` into a TAB character in the LaTeX stubs. All 14 files were repaired, and the PDF was re-checked.
- **Prompts.** `MASTER_PROMPT.md` and `COLLABORATOR_PROMPT.md` were created **locally only** (gitignored, as the lead asked).

## 2026-11-13 · P1-01…P1-07 · feat/P1-data-foundation

### Built
- **Modules:**
  - `sources.py` (registry);
  - `artefacts.py` (validated writer and `meta.json`);
  - `ingest.py` and `clean.py` (C1–C14);
  - `calibrate.py`;
  - `calendar_uae.py`, `weather.py`, `geography.py` and `reference.py`;
  - `run.py`, with `--step part1` taking about 65 s end to end on a laptop.
- **External data, each row sourced:**
  - `uae_calendar.csv` (31 events);
  - `weather_uae.csv` (Open-Meteo, 4,200 rows);
  - `emission_factors.csv` (DESNZ 2025 factor IDs; Poore and Nemecek via OWID);
  - `shelf_life.csv` (FoodKeeper product IDs; 3 labelled assumptions).
- **Artefacts:** `calendar.json`, `weather.json`, `routes.json` and `meta.json` are now **real** (`isFixture: false`). 9 fixtures remain.

### Verification
- **Cleaning counts reproduce the inspection exactly:**
  - stock-flag mismatches: 0 on all 12.4M rows (C1);
  - all-day outages: 181,791 (50K) and 429,038 (LT);
  - discount anomalies: 16,039 zero and 34 above 1.0;
  - LT series with gaps: 8,022;
  - returns: 461; closures: 10.
- **Calibration reproduces the inspection:**
  - out-of-stock hours: 0.1988 / 0.2216;
  - censoring ratio: 1.465 / 1.222;
  - markup: 1.656;
  - spoilage: 9.89%;
  - spike p95 / p99: 1.643 / 2.078 (max 5.08× on 19 Nov 2022);
  - Lunar New Year pre-week: 2.19×.
- **Maths checked against simulated data with known answers:**
  - the fixed-effects regression recovers 0.8 and 0.15;
  - the within R² is 0.809 against a theoretical 0.806;
  - the festival shape returns 2.0× pre-week.
- **Calendar:** public holidays per year (13 in 2023, 14 in 2024) match timeanddate's federal-holiday totals; Ramadan lengths are 29, 30, 29 and 30 days.
- **Weather sanity:** Dubai's mean daily maximum is 24.2 °C in January and 40.9 °C in July; 2024 rain totals 259 mm (the April 2024 storm).
- **Tests:** 70 pytest pass; the 4 real artefacts pass both the JSON Schema (Python) and Zod (TypeScript) contracts.

### Findings worth keeping for the report
1. **Festival direction depends on the market.** Spring Festival raises supermarket vegetable sales to 2.19× in the week before, but cuts city dark-store demand to 0.84×, because people leave the cities.
2. **Hormuz shock.** Goharbakhsh et al. (2026) report a 95.1% transit collapse but no significant food-price effect. The shock therefore shows up in availability and lead times.
3. **Effects on fully in-stock days** (FRN-LT): +11.5% demand per 10% discount, ×1.27 on weekends, +1.4% per °C, +11% per 10 mm of rain.

### Issues met
- FoodKeeper blocks scripted downloads (403), so the values were read in a browser and recorded with product IDs.
- The `gh` token is invalid, so there is no pull request (KI-9).

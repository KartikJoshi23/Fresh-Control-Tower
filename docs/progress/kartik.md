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

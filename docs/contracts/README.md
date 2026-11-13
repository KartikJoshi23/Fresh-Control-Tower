# Data contracts (version 1.0.0)

The contracts are the **only** interface between the Python pipeline (Track A) and the web app (Track B). They are **frozen** from Phase 4. To change one, follow the process in §4 below.

- **Source of truth:** `web/src/lib/contracts/*.ts` (Zod).
- **Generated copies:** `docs/contracts/*.schema.json` (JSON Schema, draft 2020-12). The Python pipeline validates against these. **Do not edit them by hand.**

## 1. Artefacts (all in `web/public/data/`)

| File | Schema | Producer → consumer |
|---|---|---|
| `meta.json` | `meta` | Part 4 → all pages |
| `catalog.json` | `catalog` | Part 2 → all pages |
| `calendar.json` | `calendar` | Part 1 → Demand, Scenarios |
| `weather.json` | `weather` | Part 1 → Demand |
| `series/{storeId}__{skuId}.json` | `series` | Parts 3–4 → Demand, Scenarios |
| `live/feed.json` | `live-feed` | Part 4 → Live Ops |
| `backtest.json` | `backtest` | Part 4 → Overview, Impact |
| `frontier.json` | `frontier` | Part 4 → Impact |
| `realdata.json` | `realdata` | Part 3 → Demand, Overview |
| `ablation.json` | `ablation` | Part 3 → Demand, Roadmap |
| `mcdm.json` | `mcdm` | Part 4 → Sourcing |
| `routes.json` | `routes` | Parts 1 and 4 → Sourcing |
| `impact.json` | `impact` | Part 4 → Impact |

There is also one test-only file: `web/tests/fixtures/golden/engine_cases.json`. Part 4 defines its schema, and it is never shipped.

## 2. Rules every file follows

1. **Header fields.** Every file carries `contractVersion`, `generatedAt` (ISO time with offset), `generator`, `seed`, `isFixture`, `provenance` and `sources` (ids from `meta.json` `sourcesCatalog`).
2. **Strict objects.** Unknown keys are rejected, so new fields need a change request.
3. **Provenance.** Each value is one of `REAL`, `CALIBRATED_SYNTHETIC`, `SCENARIO`, `SIMULATED_FEED`, `DERIVED` or `PRECOMPUTED`.
4. **`isFixture: true`.** This marks placeholder data. The UI must then show a "PLACEHOLDER DATA" banner, and the screenshot script must refuse to run. Fixtures carry the provenance of the artefact they stand in for.
5. **Conventions:**
   - dates are `YYYY-MM-DD`;
   - hourly times are `YYYY-MM-DDTHH:00`, in **Asia/Dubai** local time;
   - money is in **AED**;
   - quantities are in each SKU's sales unit (`kgPerUnit` converts to kg);
   - shares are 0–1, and percentages are named `…Pct` (0–100).
6. **Cross-field rules** are enforced in TypeScript. Examples: hero series reference real stores and SKUs; AHP weights sum to 1; the AHP matrix is reciprocal; quantiles do not cross; series dates increase. JSON Schema cannot express these, so the producing part's Python tests re-check them.

## 3. Validate

```bash
cd web && npm run data:validate
```

```bash
python -m pytest pipeline
```

The first validates `web/public/data` with Zod. The second does the same through the JSON Schemas.

## 4. Change process

1. Open a change request: copy `docs/decisions/CR-000-template.md` and get the lead's approval.
2. Edit the Zod contract and bump `CONTRACT_VERSION` in `web/src/lib/contracts/common.ts`.
3. Run `npm run contracts:export` to regenerate these schemas, then update the fixtures and exporters.
4. Run both validations and both test suites. Then commit the contract, the schemas, the fixtures and the change request together.

## 5. Fixtures (Phase 4)

Every artefact currently has a small, valid **placeholder** with `isFixture: true`, so the web track can build before the pipeline delivers. Part 4 replaces them with real exports.

`realdata.json` already holds the real inspection numbers from `docs/03-data-inspection.md`, but it stays a fixture until Part 3 regenerates it from pipeline code.

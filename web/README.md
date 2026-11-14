# web/ (Track B: the Fresh Control Tower dashboard)

Next.js 16 (App Router), React 19 and TypeScript (strict), built as a **pure static export**. The host only serves files: heavy computation is precomputed by `pipeline/`, and interactive work runs in the browser. See `implementation-plan.md` §2 and §6, and `docs/design-system.md`.

## Setup and scripts (Node 22; see `/.nvmrc`)

Install dependencies (always `npm ci`, never `npm install`, unless your change request adds a dependency):

```bash
npm ci
```

Start the dev server at http://localhost:3000:

```bash
npm run dev
```

| Script | What it does |
|---|---|
| `npm run build` | Static export to `out/` |
| `npm start` | Serve `out/` at http://localhost:4173 (`next start` cannot serve a static export) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then run `tsc --noEmit` |
| `npm test` | Vitest unit and contract tests |
| `npm run data:validate` | Validate every file in `public/data` against its contract |
| `npm run test:e2e` | Playwright tests against `out/`. Build first; the first run needs `npx playwright install chromium`. |
| `npm run contracts:export` | Regenerate `docs/contracts/*.schema.json` (only after an approved change request) |
| `npm run check` | Lint, typecheck, test, data validation and build: **run this before every pull request** |

## Structure

```
src/app/                 routes (Overview, demand/, scenarios/, live/, sourcing/, impact/, roadmap/)
src/components/          layout/ (TopNav, ScenarioConsole, ProvenanceChip), ui/, charts/, signature/, three/
src/lib/contracts/       Zod data contracts (FROZEN; change through docs/decisions/)
src/lib/                 data/ (loaders), state/ (scenario store), engine/ (inventory simulation), mcdm/
src/styles/tokens.css    design tokens (FROZEN)
public/data/             precomputed artefacts (currently fixtures: isFixture = true)
scripts/                 export-schemas.ts, validate-data.ts, serve-static.mjs
tests/                   Vitest; e2e/ Playwright
```

## Rules that keep the build green

- **Static export.** No API routes, middleware, rewrites, redirects or ISR. Wrap any `useSearchParams` user in `<Suspense>`.
- **No console errors** in the production build. The e2e tests fail on any console error.
- **Provenance.** Every chart shows a provenance chip. Fixture data always shows the "PLACEHOLDER DATA" banner.
- **Dependencies.** All planned dependencies are already installed and pinned. Adding or upgrading one needs a change request, because `package.json` and `package-lock.json` are shared files.

## Building a page on the Part 5 foundation

Every page (Parts 6–9) composes these pieces. Don't re-implement them.

```tsx
"use client";
import { ChartFrame, ENTITY_COLOR, TableView } from "@/components/charts/primitives";
import { DataState } from "@/components/ui/DataState";
import { useArtefact, useSeries } from "@/lib/data/hooks";
import { useScenario } from "@/lib/state/scenarioStore";

export function DemandChart() {
  const { selection } = useScenario();                       // the one shared scenario (URL-synced)
  const series = useSeries(selection.storeId, selection.skuId); // Zod-validated, cached
  return (
    <DataState result={series} what="the demand series">      {/* loading / empty / error panels */}
      {(data) => (
        <ChartFrame title="Recorded sales hide demand" provenance="CALIBRATED_SYNTHETIC"
          legend={[{ label: "True demand", color: ENTITY_COLOR.truth }, { label: "Recorded sales", color: ENTITY_COLOR.baseline }]}
          table={<TableView caption="Daily demand" rows={data.rows} columns={[/* … */]} />}>
          {/* chart: Recharts imported in the page, never in the shared layout (JS budget) */}
        </ChartFrame>
      )}
    </DataState>
  );
}
```

| Need | Use |
|---|---|
| A panel | `GlassPanel` (`variant="chart"` behind data; `"deco"` only where no data is drawn) |
| Provenance | `ProvenanceChip` (ChartFrame adds it from `provenance`) |
| Status (stock) | `StatusBadge` (icon + label + status token); `SHELF_STATUS` maps the live-feed statuses |
| Scenario values | `useScenario()`; change one with `useScenarioStore.getState().set("spike.magnitude", 3)`; fields and query keys in `lib/state/scenario.ts`. Adding a field needs a change request (plan §10.2) |
| Date window | `scenario.selection.window` = a `backtest.json` window id (`test-2026`, `normal`, `ramadan-2026`, `stockpiling`, `hormuz`, `summer`) |
| Colours | `ENTITY_COLOR.ai` / `.baseline` / `.truth`; `otherSeriesColor(i)` for slots 4+. Never cycle hues |

The six non-Overview routes hold `PagePlaceholder` stand-ins from Part 5. Each page owner replaces their `page.tsx`.

**Tests:**
- `tests/shell.test.ts` (Vitest): the URL codec, presets, chips, navigation and loader states.
- `e2e/shell.spec.ts` (Playwright): the top bar at 1440 and 375 px, Console → URL → links, the placeholder banner, contract errors as panels, zero console errors.

## The in-browser engine (Part 7)

`src/lib/engine/engine.ts` is a line-for-line port of `pipeline/freshpipe/engine_reference.py`; the Python
docstring is the specification. `tests/engine.test.ts` checks all golden cases in
`tests/fixtures/golden/engine_cases.json` (deterministic and Monte Carlo) to 1e-6. If you change one side,
regenerate the golden file (`python -m freshpipe.export`) and keep both in step.

- `scenario.ts` maps the shared scenario store onto engine inputs (spike date → planning day, heatwave
  ×1.0139 per °C from the real-data calibration, Hormuz → sea lead-time multiplier, P0 vs AI).
- `useEngine` runs `compute.ts` in a Web Worker (`worker.ts`) and falls back to the main thread if the worker
  cannot start. The page shows the recompute time and its p95.
- `surge.ts` ports `plan_surge` (the Surge Planner) and shares its worked example with the Python test.

## Live Ops, Sourcing and the Route Globe (Part 8)

- `live/feed.json` (1.25 MB, 72 KB gzipped) is only requested by `/live`. The clock is simulated; label it so.
- `src/lib/mcdm/mcdm.ts` ports AHP, entropy and TOPSIS from `pipeline/freshpipe/mcdm.py`. Its parity file
  `tests/fixtures/golden/mcdm_cases.json` is written by `python pipeline/run.py --step mcdm` from `mcdm.json` itself.
- The Route Globe is the only WebGL scene. `RouteGlobe3D.tsx` is loaded with `next/dynamic` (`ssr: false`), so
  three.js stays out of every other route. Without WebGL, or with reduced motion, the flat SVG map is shown.
- `node scripts/js-budget.mjs` (after `npm run build`) prints the initial gzip JS per route against the 250 KB
  target and 300 KB limit, and lists the lazy chunks.

## Impact, Roadmap and the QA sweep (Part 9)

- `/impact` reads `impact.json`, `frontier.json` and `backtest.json`. Dragging the frontier marker (or the slider) sets
  `policy.serviceTarget`, so the choice carries to the Scenario Studio. The tornado is illustrative and labelled so.
- `/roadmap` quotes only results from the artefacts; rollout costs are deliberately not estimated.
- `npx playwright test e2e/qa.spec.ts` checks every route at 375, 768 and 1440 px (no horizontal scroll, no console
  errors) and runs axe (WCAG 2.1 A/AA; serious and critical issues fail). Lighthouse is not a dependency: run it in
  Chrome DevTools on the deployed site and record the scores in PROGRESS.md.
- Anything with `position: absolute` (including `.sr-only` text) inside a scrolling table needs a positioned parent,
  or it escapes the scroll box and widens the page on phones.

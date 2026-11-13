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

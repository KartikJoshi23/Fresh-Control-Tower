# screenshots/ (Phase 6)

Captured reproducibly by a Playwright script (`web/e2e/screenshots.spec.ts`, added in Phase 6) from the production build. They are used as figures in the report.

**File naming:** `NN_page_state_viewport.png`

| Part | Meaning | Example |
|---|---|---|
| `NN` | Two-digit order in the report | `05` |
| `page` | Route name | `live-ops` |
| `state` | What the screenshot shows | `hormuz-alerts` |
| `viewport` | Width × height | `1440x900` or `375x812` |

Example: `05_live-ops_hormuz-alerts_1440x900.png`

**Rules:**
- Never capture placeholder data. The script refuses to run if any artefact has `isFixture: true`.
- Every figure caption in the report states the provenance of what is shown.
- Copy the screenshots the report uses into `report/figures/`, because Overleaf cannot read `../screenshots/` unless the whole repository is uploaded.

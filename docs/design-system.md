# Design system: "night-shift control tower"

> **Frozen once the lead approves the kit.** Changes need a change request (`docs/decisions/`).
> - The source of truth for values is `web/src/styles/tokens.css`.
> - The source of truth for rules is this file, together with `implementation-plan.md` §6.

## 1. Principles

1. **Dark-only.** The look is a logistics control room at night: a deep navy plane, frosted-glass panels, and faint floor-marking grid lines.
2. **Honest by default.** Every chart and figure carries a **provenance chip**. Placeholder data always shows a banner.
3. **Colour has a job.** Data colours come only from the validated palette. The UI accent never appears in charts.
4. **Accessible.** WCAG AA text contrast, full keyboard use, no meaning carried by colour alone, and reduced-motion support.
5. **Fast.** Static export, lazy-loaded heavy parts, and a performance budget (§7).

## 2. Layout

- **Navigation.** A horizontal **top navigation bar only**. There is no sidebar anywhere. On mobile, the bar collapses into a drop-down sheet from the top.
- **Top bar.** Sticky, 64 px tall.
- **Grid.** 12 columns, maximum width 1440 px.
- **Gutters.** 16 px on mobile, 24 px on desktop. There must be no horizontal scroll at 375 px.
- **Panels.** `--radius-panel` (16 px), a hairline border, and at most **one** blur layer per panel.
- **Pages (7):** Overview `/`, Demand Lab `/demand`, Scenario Studio `/scenarios`, Live Ops `/live`, Sourcing `/sourcing`, Impact `/impact`, Roadmap `/roadmap`.
- **Scenario Console.** Opens as a glass drawer from the top, available on every page. Active scenarios appear as chips in the top bar.

## 3. Surfaces

| Token | Value | Use |
|---|---|---|
| `--plane` | `#0a1018` | Page background, with subtle radial glows and a 1 px grid at 4% |
| `--surface` | `#111923` | Validated chart surface |
| `--glass-chart` | `rgba(17,25,35,0.88)` + `blur(18px) saturate(140%)` | **Every panel that contains data.** It composites to `#101822`–`#121c28`. |
| `--glass-deco` | `rgba(255,255,255,0.06)` | Decorative panels only. **Never behind data.** |
| `--hairline` | `rgba(255,255,255,0.10)` | Borders |

**Fallback.** Use a solid `--surface` when `backdrop-filter` is unsupported or reduced transparency is requested.

## 4. Colour

The palette was validated on 13 Nov 2026 with the dataviz palette validator. It passes on surfaces from `#101822` to `#191e26`: worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3, and all marks at least 3:1.

### 4.1 Ink (text)

| Token | Value | Contrast on the surface |
|---|---|---|
| `--ink-primary` | `#f0efec` | 15.4:1 |
| `--ink-secondary` | `#c3c2b7` | 9.9:1 |
| `--ink-muted` | `#898781` | 4.9:1 |

**Text always uses ink tokens, never series colours.**

### 4.2 Categorical (identity)

The order is fixed and colours are never cycled:

| Slot | Token | Value | Entity (app-wide, frozen) |
|---|---|---|---|
| 1 | `--series-1` | `#3987e5` blue | **AI / recommended** (forecast, recovered demand, AI policy) |
| 2 | `--series-2` | `#d95926` orange | **Baseline / legacy** (recorded sales, the P0 policy) |
| 3 | `--series-3` | `#199e70` aqua | **True demand** (synthetic ground truth) |
| 4 | `--series-4` | `#c98500` | Next series, in order |
| 5 | `--series-5` | `#d55181` | Next series, in order |
| 6 | `--series-6` | `#008300` | Next series, in order |
| 7 | `--series-7` | `#9085e9` | Next series, in order |
| 8 | `--series-8` | `#e66767` | Next series, in order |

Rules:
- **Colour follows the entity, never its rank.** A filter must not repaint the series that remain.
- **Map-like or all-pairs views carry at most 3 colours.** These are views where any two marks can sit side by side (globe, scatter, small multiples). Beyond 3, use pattern, labels or facets.
- **A 9th series is never a new hue.** Fold it into "Other" instead.

### 4.3 Status (reserved meaning, always icon + label)

| Token | Value | Meaning | Icon |
|---|---|---|---|
| `--status-good` | `#0ca30c` | In stock | ✓ |
| `--status-warning` | `#fab219` | At risk | ⚠ |
| `--status-serious` | `#ec835a` | Expiring | ⏳ |
| `--status-critical` | `#d03b3b` | Stockout or disruption | ✕ |

Status colours are never used for an ordinary series. A view never mixes status colours with the diverging scale.

### 4.4 Sequential and diverging

- **Sequential** (magnitude, for example heat strips): the blue ramp `--seq-100` to `--seq-700`.
- **Diverging** (cover vs target):
  - `--div-surplus` blue for surplus or waste risk;
  - `--div-shortage` red for shortage risk;
  - a grey midpoint, `--div-mid`.

### 4.5 UI accent

`--accent` `#4cc9e0` (cold-chain cyan) is used **only** for focus rings, the active nav item and toggles. It never appears in a chart.

## 5. Typography

- **Font.** Inter, loaded through `next/font` as `--font-inter`, for both UI and charts.
- **Scale.** 12, 14, 16, 20, 24, 32 and 40 px.
- **Numerals.** Tabular numerals (`font-variant-numeric: tabular-nums`) in tables and on axes. Hero numbers use proportional numerals.

## 6. Components and their rules

| Component | Rules |
|---|---|
| **TopNav** | Horizontal. Logo plus 7 links plus the Scenario button plus active-scenario chips. Collapses to a top sheet below 768 px. The active link uses the accent underline. |
| **ScenarioConsole** | Top drawer. Presets: Normal, Ramadan 2026, 200→500 Spike, Hormuz 2026, Heatwave. Its controls map 1:1 to the scenario store (`implementation-plan.md` §2.5). State is synced to the URL. Any component that reads the URL sits inside `<Suspense>`. |
| **GlassPanel** | `variant="chart"` (navy glass) or `variant="deco"`. Charts may only sit in `chart` panels. |
| **ProvenanceChip** | **Monochrome** outline chip with icon and text: REAL ●, SYNTHETIC ◆, SCENARIO ▲, SIMULATED ⟳, DERIVED ∑, PRECOMPUTED ⧗. A tooltip names the source. |
| **PlaceholderBanner** | Shown whenever any loaded artefact has `isFixture: true`: "PLACEHOLDER DATA: not results". |
| **KPI tile** | A hero number with a delta against the baseline (a status icon plus text, not colour alone) and a provenance chip. Numbers count up on scenario change, unless reduced motion is set. |
| **Chart frame** | Contains: title (what the chart answers), provenance chip, legend (2 or more series), direct labels (4 or fewer series), a crosshair or per-mark tooltip, and a **table-view toggle**. Gridlines are recessive. **No dual axes.** |
| **Data states** | Every data load has loading, empty and error states. A failed fetch or contract check shows an error panel, never a console error. |

### Signature visuals: colour rules

| Visual | Rule |
|---|---|
| Hidden Demand Reveal | Recorded sales in slot 2, true demand in slot 3, recovered demand and the forecast band in slot 1 |
| Surge Planner | Supplier lanes in neutral ink. The shelf-life window is a sequential tint. The order-by marker uses a status colour plus an icon. |
| Waste–Availability Frontier | Baseline in slot 2, AI in slot 1 |
| Live Shelf Grid | Two modes that are never mixed. **Status** mode: status fills plus icon and label. **Cover** mode: diverging fills plus monochrome icons. |
| Route Globe (the only WebGL scene) | One hue for all arcs. Disruption uses status colours plus an icon. Archetype is shown by dash pattern and label (solid = local/GCC truck, dashed = sea, dotted = air). |
| TOPSIS Rank Race | One hue (slot 1). The recommended supplier is emphasised and the others recede. Archetype is shown as icon and label. |

## 7. Motion and performance

| Area | Rule |
|---|---|
| Motion library | Motion (formerly Framer Motion) |
| Transitions | Spring, 200–350 ms; purposeful only (panel reveals, chart morphs, count-ups) |
| Reduced motion | `prefers-reduced-motion` disables all non-essential motion |
| JS budget | Initial JS per route ≤ 250 KB gzip as the target, 300 KB as the hard limit |
| Code splitting | Recharts is loaded per page. The WebGL chunk loads on `/sourcing` only. |
| Scenario engine | Runs in a Web Worker, with recompute under 150 ms at p95 |
| Page speed | LCP ≤ 2.5 s (mobile, simulated 4G); CLS ≤ 0.1 |

## 8. Accessibility checklist (every page)

- [ ] Keyboard navigation works, and focus rings are visible (accent).
- [ ] No meaning is carried by colour alone (icons and labels; texture where needed).
- [ ] Every chart has a table view.
- [ ] axe reports no serious or critical violations.
- [ ] No horizontal scroll at 375 px.
- [ ] Zero console errors in the production build.

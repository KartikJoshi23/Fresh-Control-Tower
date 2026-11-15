# Design system: "Neon Noir" control tower

> **Changes need a change request** (`docs/decisions/`). The current theme comes from **CR-003** (2026-11-15), which replaced the navy "night-shift" theme.
> - The source of truth for values is `web/src/styles/tokens.css`.
> - The source of truth for rules is this file, together with `implementation-plan.md` §6.

## 1. Principles

1. **Dark-only.** The look is a control tower at night:
   - a **true-black** plane with a slow violet and fuchsia aurora;
   - **translucent glass** panels with a gradient rim that lights up under the cursor;
   - neon violet chrome.
2. **Honest by default.** Every chart and figure carries a **provenance chip**. Placeholder data always shows a banner.
3. **Colour has a job.** Data colours come only from the validated palette. The UI accent and the brand gradient never encode data.
4. **Accessible.** WCAG AA text contrast, full keyboard use, no meaning carried by colour alone, and reduced-motion support.
5. **Fast.** Static export, lazy-loaded heavy parts, CSS-first motion and a performance budget (§7).

## 2. Layout

- **Navigation.** A horizontal **top navigation bar only**. There is no sidebar anywhere. Below 1024 px the links move into a drop-down sheet from the top.
- **Top bar.** Sticky, exactly 64 px tall: black glass with a violet-to-fuchsia hairline. It holds:
  - the animated brand mark;
  - a floating pill group of links, with a highlight that springs between them;
  - the gradient-rimmed Scenario button.
- **Grid.** 12 columns, maximum width 1440 px.
- **Gutters.** 16 px on mobile, 24 px on desktop. There must be no horizontal scroll at 375 px.
- **Panels.** `--radius-panel` (20 px), a gradient rim and at most **one** blur layer per panel.
- **Page header** (`PageHeader`): an eyebrow pill with a live dot, a large gradient title (Space Grotesk), a lede and an optional slot (tabs, chips).
- **Pages (7):** Overview `/`, Demand Lab `/demand`, Scenario Studio `/scenarios`, Live Ops `/live`, Sourcing `/sourcing`, Impact `/impact`, Roadmap `/roadmap`.
- **Scenario Console.** A glass drawer below the bar, available on every page. Active scenarios appear as chips in the top bar.

## 3. Surfaces

| Token | Value | Use |
|---|---|---|
| `--plane` | `#030305` | Page background. Behind it sits the fixed `Backdrop`: three drifting aurora glows, a masked dot grid and grain. |
| `--surface` | `#0e0b15` | Solid fallback; inside the validated chart-surface range |
| `--glass-chart` / `--glass-chart-top` | `rgba(16,12,25,0.8)` / `rgba(26,19,40,0.82)` + `blur(22px) saturate(150%)` | **Every panel that contains data.** It composites to `#0d0a14`–`#1a1426`. |
| `--glass-deco` | `rgba(255,255,255,0.035)` | Decorative panels only. **Never behind data.** |
| `--hairline` / `--hairline-strong` | `rgba(255,255,255,0.07)` / `rgba(196,167,255,0.22)` | Dividers and control borders |

- **Glass rim.** A masked `::before` paints a violet → transparent → fuchsia rim. `Spotlight.tsx` writes the cursor position into `--mx`/`--my`, so the rim and a faint interior glow follow the pointer.
- **Fallback.** Use a solid `--surface` when `backdrop-filter` is unsupported or reduced transparency is requested.

## 4. Colour

The palette was validated on 15 Nov 2026 with the dataviz palette validator, in dark mode, against surfaces `#0a0710` and `#1a1426`. It passes all checks:
- every slot sits in the L 0.48–0.67 band;
- worst adjacent CVD ΔE is 9.6;
- normal-vision ΔE is at least 17.2;
- every mark has at least 3:1 contrast.

### 4.1 Ink (text)

| Token | Value | Contrast (on `#1a1426` / `#0a0710`) |
|---|---|---|
| `--ink-primary` | `#f5f2fb` | 16.2:1 / 18.1:1 |
| `--ink-secondary` | `#c8c0d8` | 10.2:1 / 11.4:1 |
| `--ink-muted` | `#948ba6` | 5.6:1 / 6.2:1 |

**Text always uses ink tokens, never series colours.** Gradient text (titles) only uses light stops.

### 4.2 Categorical (identity)

The order is fixed and colours are never cycled:

| Slot | Token | Value | Entity (app-wide, frozen) |
|---|---|---|---|
| 1 | `--series-1` | `#9d6bff` violet | **AI / recommended** (forecast, recovered demand, AI policy). Its lines carry a soft glow. |
| 2 | `--series-2` | `#d4702c` orange | **Baseline / legacy** (recorded sales, the P0 policy) |
| 3 | `--series-3` | `#129a79` teal | **True demand** (synthetic ground truth) |
| 4 | `--series-4` | `#b58c16` gold | Next series, in order |
| 5 | `--series-5` | `#de5596` pink | Next series, in order |
| 6 | `--series-6` | `#4e9a2b` green | Next series, in order |
| 7 | `--series-7` | `#3b90dc` blue | Next series, in order |
| 8 | `--series-8` | `#e05c4c` coral | Next series, in order |

Rules:
- **Colour follows the entity, never its rank.** A filter must not repaint the series that remain.
- **Map-like or all-pairs views carry at most 3 colours.** These are views where any two marks can sit side by side (globe, scatter, small multiples). Beyond 3, use pattern, labels or facets.
- **A 9th series is never a new hue.** Fold it into "Other" instead.

### 4.3 Status (reserved meaning, always icon + label)

| Token | Value | Meaning | Icon |
|---|---|---|---|
| `--status-good` | `#22c55e` | In stock | ✓ |
| `--status-warning` | `#fbbf24` | At risk | ⚠ |
| `--status-serious` | `#fb8a5a` | Expiring | ⏳ |
| `--status-critical` | `#f5525a` | Stockout or disruption (cells pulse) | ✕ |

Status colours are never used for an ordinary series. A view never mixes status colours with the diverging scale.

### 4.4 Sequential and diverging

- **Sequential** (magnitude, for example heat strips and rank bars): the violet ramp `--seq-100` `#ede4ff` to `--seq-700` `#5733ad`. It is validated as ordinal on both surfaces.
- **Diverging** (cover vs target):
  - `--div-surplus` violet for surplus or waste risk;
  - `--div-shortage` coral for shortage risk;
  - a grey midpoint, `--div-mid` `#3a3446`.

### 4.5 UI chrome

| Token | Value | Use |
|---|---|---|
| `--accent` | `#a78bfa` | Focus rings, links and active states (7.4:1 as text) |
| `--accent-strong` / `--accent-deep` | `#8b5cf6` / `#6d28d9` | Filled controls, slider thumbs |
| `--accent-2` / `--accent-3` | `#e879f9` / `#f472b6` | Fuchsia and pink highlights (live dots, gradient ends) |
| `--gradient-brand`, `--gradient-button` | violet → fuchsia → pink | Brand wordmark, Scenario button rim, active toggles |

None of these ever appear in a chart's data marks.

## 5. Typography

- **Fonts.** Two faces, loaded through `next/font`:
  - **Space Grotesk** (`--font-display`) for page titles, panel titles and hero numbers;
  - **Inter** (`--font-inter`) for UI text, body copy and charts.
- **Scale.** Body 13–16 px. Panel titles about 17 px. KPI values 26–34 px. Page titles `clamp(2.1rem, …, 3.6rem)`.
- **Labels.** Eyebrows and stat labels are 11 px uppercase with wide tracking.
- **Numerals.** Tabular numerals in tables, on axes and in KPI values.

## 6. Components and their rules

| Component | Rules |
|---|---|
| **TopNav** | Horizontal. Brand plus 7 links in a pill group plus the Scenario button plus active-scenario chips (≥ 1360 px). A highlight springs between links (`Glide.tsx`). Below 1024 px the links collapse to a top sheet. |
| **ScenarioConsole** | Glass drawer. It springs open (CSS) and fades out with Motion's mini `animate`. Presets: Normal, Ramadan 2026, 200→500 Spike, Hormuz 2026, Heatwave. Its controls map 1:1 to the scenario store (`implementation-plan.md` §2.5). State is synced to the URL. Any component that reads the URL sits inside `<Suspense>`. |
| **PageHeader** | Eyebrow, gradient H1, lede, optional slot. A staggered CSS rise-in. |
| **GlassPanel** | `variant="chart"` (violet-black glass) or `variant="deco"`. Charts may only sit in `chart` panels. |
| **ProvenanceChip** | **Monochrome** pill with icon and text: REAL ●, SYNTHETIC ◆, SCENARIO ▲, SIMULATED ⟳, DERIVED ∑, PRECOMPUTED ⧗. The glyph is violet. A tooltip names the source. |
| **PlaceholderBanner** | Shown whenever any loaded artefact has `isFixture: true`: "PLACEHOLDER DATA: not results". |
| **KPI tile** | A hero number that counts up (`AnimatedNumber`) and a delta pill against the baseline (status icon plus text, not colour alone). A provenance chip, a gradient top sheen, and a spring lift on hover. |
| **Chart frame** | Contains: title (what the chart answers), provenance chip, legend (2 or more series), direct labels (4 or fewer series), a crosshair with ringed markers or a per-mark tooltip, and a **table-view toggle**. Gridlines are recessive. **No dual axes.** It reveals on scroll (Motion `inView`). |
| **Controls** | Range sliders with a gradient fill (`--fill`) and a glowing thumb; gradient toggles; pill presets; glass selects; tabs with a springing highlight. |
| **Data states** | Every data load has loading (with shimmer), empty and error states. A failed fetch or contract check shows an error panel, never a console error. |

### Signature visuals: colour rules

| Visual | Rule |
|---|---|
| Hidden Demand Reveal | Recorded sales in slot 2, true demand in slot 3, recovered demand and the forecast band in slot 1 |
| Surge Planner | Supplier lanes in neutral ink. The shelf-life window is a sequential tint. The order-by marker uses a status colour plus an icon. |
| Waste–Availability Frontier | Baseline in slot 2, AI in slot 1. The recommended point pulses. |
| Live Shelf Grid | Two modes that are never mixed. **Status** mode: status rims plus icon and label (stockouts pulse). **Cover** mode: diverging fills plus monochrome icons. |
| Route Globe (the only WebGL scene) | Violet arcs (`--seq-300`) on a black globe with a faint atmosphere. Disruption uses status colours plus an icon. Archetype is shown by dash pattern and label (solid = local/GCC truck, dashed = sea, dotted = air). It turns slowly unless reduced motion is set. |
| TOPSIS Rank Race | The violet sequential ramp. The recommended supplier is emphasised (light bar with a glow) and the others recede. Archetype is shown as icon and label. |

## 7. Motion and performance

| Area | Rule |
|---|---|
| Motion approach | **CSS first** (keyframes and transitions on spring curves `--ease-spring` / `--ease-out`), plus **Motion** (formerly Framer Motion) vanilla APIs: `inView` (scroll reveals, count-up triggers) and `motion/mini` `animate` (Web Animations API; the Console exit). |
| Not used | Motion's React layer (`m`, `LazyMotion`, `AnimatePresence`): about 49 KB gzip on every route, which broke the budget. |
| Entrances | Route rise-in (`app/template.tsx`), staggered page-header and grid children, KPI rows, chart lines drawing in, bars growing from zero. Always `fill-mode: backwards`, so no transform is left behind. |
| Reduced motion | `prefers-reduced-motion` disables all non-essential motion (CSS rule plus `useReducedMotion`). Scroll-reveal hiding applies only under `no-preference`. The axe suite runs with reduced motion, so contrast is never measured mid-fade. |
| JS budget | Initial JS per route ≤ 250 KB gzip as the target, 300 KB as the hard limit (`node scripts/js-budget.mjs`; 221–254 KB after CR-003) |
| Code splitting | The WebGL chunk loads on `/sourcing` only. |
| Scenario engine | Runs in a Web Worker, with recompute under 150 ms at p95 |
| Page speed | LCP ≤ 2.5 s (mobile, simulated 4G); CLS ≤ 0.1 |

## 8. Accessibility checklist (every page)

- [ ] Keyboard navigation works, and focus rings are visible (accent).
- [ ] No meaning is carried by colour alone (icons and labels; texture where needed).
- [ ] Every chart has a table view.
- [ ] axe reports no serious or critical violations.
- [ ] No horizontal scroll at 375 px.
- [ ] Zero console errors in the production build.

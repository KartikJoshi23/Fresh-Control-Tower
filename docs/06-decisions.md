# 06 · Decisions: ordering policies, supplier ranking, backtests, impact and exports (Part 4)

> **Tasks:**
> - P4-01: τ simulation-optimisation and the shelf-life guard;
> - P4-02: the surge planner and the unannounced-spike response;
> - P4-03: MCDM;
> - P4-04: Monte Carlo backtests;
> - P4-05: impact;
> - P4-06: exports, the engine reference and golden cases.
>
> **Code:** `pipeline/freshpipe/{optimise,mcdm,backtest,impact,export,engine_reference}.py`, plus a same-day top-up channel in `simulate.py`.
>
> **Run:** `python pipeline/run.py --step part4` (mcdm → tau → backtest → export; about 25 minutes, almost all of it the 200-run Monte Carlo).
>
> **Outputs** (all in `web/public/data/`, all valid, **no fixtures left**): `mcdm.json`, `backtest.json`, `frontier.json`, `impact.json`, `series/*.json` (40), `live/feed.json` and `meta.json`. There is also the test-only `web/tests/fixtures/golden/engine_cases.json`.
>
> **Provenance:** CALIBRATED SYNTHETIC and PRECOMPUTED. The operator is fictional. Annualised figures are **illustrative**.

## 1. Business results against the plan's targets (plan §1.2)

Medians are over **200 paired Monte Carlo runs** of the 2026 test window: all 320 store-SKU series, with demand noise, supply and quality culls redrawn each run. P10–P90 ranges are in `backtest.json`, and every run gives the same sign.

| Target | Result (P3, the full AI, vs P0) | Verdict |
|---|---|---|
| Lost sales ≥ 30% lower | **−93.7%** (P1 −81.6%, P2 −92.0%) | ✅ |
| Waste ≥ 20% lower **at the same time** | Waste kg **+63.9%**; waste as % of receipts 3.18% → 3.57% | ❌ in absolute kg. ✅ at equal availability (§4): at P0's best availability, AI waste is about 40% lower |
| Total cost lower in every stress window | −50.5% (normal) to −75.7% (summer); lower in 200/200 runs in every window | ✅ |
| AI-Intraday beats AI-Daily (KQ3) | Availability 93.8% → 97.2%; lost sales −56% vs P1 | ✅ |
| Smart sourcing pays under disruption (KQ5) | Hormuz window: P3 vs P2 lost sales −32%, cost −11%, availability 94.3% → 95.9% | ✅ |

**Why waste rises.**
- The legacy rule starves the shelves: P0 has **69.4% availability** and fills 68.4% of true demand in 2026.
- The AI fills 98.0%, so it buys and sells about 43% more, and some of that extra stock spoils.
- Waste **per unit received** is about flat (3.2% → 3.6%); waste **at the same availability** is much lower (§4).
- So the AI *moves* the frontier and then, because a lost sale costs more than a wasted unit (§2), spends part of the gain on availability.
- A board that wants lower absolute waste can pick a lower τ on the frontier.

| Median, 2026 | P0 Baseline | P1 AI-Daily | P2 AI-Intraday | P3 + Smart Sourcing |
|---|---|---|---|---|
| Availability (in-stock trading hours) | 69.4% | 93.8% | 97.2% | **97.7%** |
| Fill rate (sold ÷ true demand) | 68.4% | 94.2% | 97.5% | **98.0%** |
| Waste, % of receipts (kg) | 3.18% | 3.39% | 3.56% | 3.57% |
| Total cost, Jan–Oct (AED M) | 7.54 | 2.85 | 2.26 | **2.14** |
| CO2e, waste + transport (t) | 353 | 519 | 532 | 513 |

**By stress window** (P3 vs P0: lost sales / waste kg / total cost): normal −91% / +30% / −51%; Ramadan 2026 −91% / +76% / −72%; stockpiling −88% / +97% / −72%; Hormuz −91% / +65% / −69%; summer −96% / +74% / −76%.

## 2. The ordering policy (P4-01)

**Order-up-to.** At 22:00 an order must cover C = ⌈mean lead time⌉ days (the same cover logic as P0, D-21):

```
S = (Σ μ_j + z(τ) · σ_C) ÷ (1 − handling loss)
σ_C = √(0.3 (Σ σ_j)² + 0.7 Σ σ_j²)
σ_j = (P90 − P10) ÷ 2.563
```

**Guards.** The **shelf-life guard** caps the order at the P50 demand from its arrival to the end of its sellable life, net of stock already held. Minimum presentation is one case (as for P0).

**Worked example** (`test_ai_order_worked_example`).
- **Inputs.** μ = 10 a day, σ = 2, lead 2, τ = 0.5.
- **Level.** S = 20. The guard is 5 sellable days × 10, minus 10 held = 40.
- **Order.** With 4 on hand and 6 on order, it orders 10.
- **At τ = 0.9.** S = 20 + 1.2816 × √10.4 = 24.13.

**Cost assumptions (AED).** These come from the catalogue unless stated. All are documented in `optimise.py` and `impact.json`:

| Item | Value | Basis |
|---|---|---|
| Lost margin | price − unit cost | Catalogue (markups drawn from the REAL Kaggle distribution) |
| Goodwill per lost unit | 10% of price | ASSUMPTION |
| Waste | unit cost + 0.20 AED/kg disposal | ASSUMPTION (disposal) |
| Holding | 0.3% of unit cost per unit-day | ASSUMPTION |
| Same-day top-up premium | 25% of unit cost | ASSUMPTION (UAE wholesale market, 16:00 delivery) |
| Sourcing premium | landed-cost factor of the alternative ÷ primary | ASSUMPTION (`mcdm.LANDED_COST_FACTOR`) |

**Newsvendor intuition.**
- At the real median markup of 1.66, Cu ÷ (Cu + Co) = 0.66 ÷ 1.66 = **0.40** (plan §4.1); with 10% goodwill it is 0.45 (both tested).
- Multi-day shelf life and FIFO break the closed form, hence the simulation.

**τ per SKU** (`--step tau`).
- **Method.** A grid of {0.50 … 0.99} in the full hourly FIFO simulation over 2025 H2 (validation), 2 runs each, using **out-of-sample** forecasts fitted to June 2025.
- **Best single τ: 0.85.** Per-SKU τ: median 0.85, P10 0.50, P90 0.99.
- **Saving.** Per-SKU τ cuts validation cost by 12.7% vs the best single τ (in-sample to the tuning window; the test window is the honest check).

**The ladder:**
- **P1 AI-Daily:** the rule above, with the lead time of the terms in force (it tracks supplier performance).
- **P2 AI-Intraday:**
  - *Noon top-up.* The rest of the day's demand is projected from the morning's sales: level = (sold + 0.3 × P50) ÷ (morning profile mass + 0.3). If stock falls short, a top-up comes from a UAE wholesale market at 16:00 (2% missed, 5% short).
  - *Surge response.* When a store's sales exceed 1.3 × its forecast, the next two days' forecasts are scaled by that ratio, capped at 2.5×. This uses the store-level signal that met the spike targets in P3-05.
- **P3 + Smart Sourcing:** during a disruption, every SKU whose primary supplier is disrupted is ordered from its best compatible supplier by TOPSIS under the Hormuz scenario. Bananas, for example, switch from `sup-sea-import` (through Hormuz) to `sup-sea-khorfakkan` (avoiding it).

## 3. Supplier ranking (P4-03)

**Criteria.** There are seven, DERIVED from the same supplier terms the simulation uses:

| Criterion | How it is measured |
|---|---|
| Landed cost | Factor × AED 6/kg (ASSUMPTION) |
| Lead time | Mean delay from `SupplyTerms` |
| Reliability | On time and in full |
| Freshness on arrival | Shelf life ÷ (shelf life + transit days) |
| Quality rejects | The categories' handling loss |
| Disruption exposure | Chokepoint weights: Hormuz 0.6, Bab el-Mandeb 0.25, Suez 0.15; air 0.1 (ASSUMPTION) |
| Carbon | Route km × the DESNZ 2025 mode factor |

**Weights.**
- **AHP, "board preference".** Importance scores are freshness 5, reliability 5, cost 4, exposure 4, lead time 3, rejects 2, carbon 2; a difference of d points scores 1 + 2d on Saaty's scale.
- **The resulting weights:** reliability 0.301, freshness 0.301, cost 0.135, exposure 0.135, lead time 0.064, rejects 0.031, carbon 0.031.
- **Consistency:** λmax gives **CR = 0.025** (< 0.10).
- **Entropy weights** (data-driven) favour the criteria that vary most: carbon 0.48 and exposure 0.43.

**TOPSIS closeness.**

| Supplier | Normal | Hormuz 2026 |
|---|---|---|
| `sup-local-bakery` | 0.95 | 0.96 |
| `sup-local-farm` | 0.86 | 0.89 |
| `sup-gcc-truck` | 0.86 | 0.89 |
| `sup-gcc-ksa` | 0.84 | 0.89 |
| `sup-sea-khorfakkan` | 0.78 | 0.67 |
| `sup-air-import` | 0.67 | 0.54 |
| `sup-air-europe` | 0.66 | 0.53 |
| `sup-sea-import` | 0.42 | 0.22 |
| `sup-sea-europe` | 0.22 | 0.17 |

The Hormuz scenario applies the simulation's disruption terms (D-20: availability and lead time, not price), so the ranking and the backtest agree.

**Verification.**
- **Published example.** Entropy weights and TOPSIS closeness reproduce a published example to 6 decimals: *Selected multi-criteria decision-making methods and their applications to product and system design*, arXiv:2407.09931, ch. 15, Exercise 2. Weights 0.233374/0.216633/0.03823/0.262035/0.249728; closeness 0.398895/0.358287/0.958917/0.508982.
- **AHP.** A perfectly consistent matrix returns its own weights with CR = 0.
- **Allocation.** The LP (SciPy `linprog`) and the browser's greedy rule agree.

**Note on archetypes.** The bakery is labelled `local_farm` in `mcdm.json` until **CR-002** renames the enum.

## 4. Waste–availability frontier

The frontier runs one τ for every SKU on the 2026 test window. For P0, the legacy buffer is set to z(τ) × 0.35.

| | Availability | Waste (% receipts) | Total cost |
|---|---|---|---|
| P0 at its maximum setting (τ 0.99) | 90.9% | **5.47%** | AED 4.04 M |
| P1 at τ 0.50 | 91.0% | **3.23%** | AED 3.39 M |

So at the **same availability, the AI wastes about 41% less** and costs 16% less. P1's whole curve sits above and left of P0's.

## 5. Surge planner (P4-02)

`optimise.plan_surge` answers "how early do we stock up?" for an announced spike. It works out:
- the latest safe order day per supplier (spike start − lead time − a 1-day handling buffer);
- whether one pre-built delivery can cover the spike within its sellable shelf life;
- the options: pre-build with the primary supplier, switch to the fastest supplier with an open window, split into two deliveries, or accept a planned shortfall. Each option has lost units, waste, purchase cost, margin and transport CO2e.

**Worked example** (`test_surge_planner_worked_example`).
- **Spike.** +50 units a day for 3 days from day 10, announced on day 2. Shelf life is 4 days with a 1-day minimum at sale, so stock is sellable for 3 days.
- **One delivery.** Arriving on day 9, it covers days 10–11 only. Pre-build loses 50 units; a split loses 0.
- **Minimum warning:** 2 days.

The browser version (Part 7) reuses this logic. The unannounced-spike response is P2's surge rule (§2).

## 6. Exports (P4-06)

- **`series/{store}__{sku}.json`** (40 hero series, about 145 KB each, 17 KB gzipped):
  - 2025–2026 daily history under P0 (true demand, recorded sales, recovered demand, the 2026 forecast band, stockout hours, receipts, waste, closing stock);
  - an `engine` block planned from **11 Feb 2026**: 35 days of quantiles by horizon bucket, lead times of the compatible suppliers, costs, profiles, the optimised τ, and P1's stock and open orders that morning.
- **`live/feed.json`** (SIMULATED FEED):
  - 10–23 March 2026, 2 stores × 10 SKUs, 6,720 hourly ticks under P3;
  - 626 events: disruption, stockout risk, stockout, expiring, spike detected, PO created and PO received;
  - 312 purchase orders, 19 of them flagged "needs approval" (above 1.5 × the expected demand over their cover);
  - 1.25 MB raw, **72 KB gzipped**.
- **`engine_reference.py` + `engine_cases.json`:**
  - the exact specification of the browser engine (daily FIFO, the AI and P0 rules, Acklam Φ⁻¹, Box–Muller on **mulberry32**);
  - 24 golden cases (3 series × 8 scenarios), each deterministic plus 50 Monte Carlo runs;
  - mulberry32 is **bit-identical to JavaScript** (checked under Node 22 for 4 seeds). Part 7 must match within 1e-6.

## 7. Verification record

| What | Test | Result |
|---|---|---|
| Published TOPSIS + entropy example; consistent AHP; reciprocity and CR of the board matrix; LP = greedy | `test_decisions.py` | Pass |
| Newsvendor critical ratio (0.40 and 0.45); AI order, guard and noon top-up worked examples; smart sourcing; surge planner | `test_decisions.py` | Pass |
| mulberry32 = JavaScript; Φ⁻¹ within 1e-8 of SciPy; rounding; engine worked examples (steady state, overstock expiry, spike loss) | `test_decisions.py` | Pass |
| Golden cases reproduce from the committed series files (deterministic and Monte Carlo) | `test_golden_cases_reproduce_from_the_committed_series_files` | Pass |
| Backtest: AI cuts lost sales and cost in every window; P2 > P1 (KQ3); P3 > P2 in Hormuz (KQ5); frontier dominance; the waterfall adds up | `test_decisions.py` | Pass |
| P0 results unchanged by the new top-up channel | `test_committed_report_reproduces_from_the_seed` | Pass |
| All 52 artefacts validate (Zod, including cross-field rules) | `npm run data:validate` | 52/52, no fixtures |

## 8. Limitations

- **One demand world.** Monte Carlo varies the noise, supply and culls, but the expected-demand path (festivals, the spike calendar) is fixed.
- **Forecasts from the P0 history.** The AI policies use forecasts built from the recovered P0 history. Recovery is nearly unbiased (−1.5%), so this approximates learning from their own history.
- **Assumed costs.** Costs, the top-up channel, supplier cost factors and chokepoint weights are ASSUMPTIONS. The impact is illustrative.
- **Per-unit framing.** Absolute CO2e rises with the extra volume served (424 t → 616 t a year), while CO2e per unit sold is about flat. The report must state this.

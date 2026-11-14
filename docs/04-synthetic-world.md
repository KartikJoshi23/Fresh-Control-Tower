# 04 · The synthetic UAE world and the P0 baseline (Part 2)

> **Tasks:** P2-01 (generator), P2-02 (hourly simulation, P0 rule), P2-03 (fidelity report).
> **Code:** `pipeline/freshpipe/{world,generate,simulate,fidelity}.py`. **Config:** `pipeline/config.yaml` (`world`, `baseline_policy`).
> **Outputs:** `web/public/data/catalog.json` (committed), `data/processed/fidelity_report.json` (committed), `data/synthetic/*` (gitignored, rebuilt from the seed).
> **Provenance:** everything here is **CALIBRATED SYNTHETIC**. The operator, stores, suppliers, prices and base demand are **fictional**.

## 1. What it is, in one paragraph

The real datasets have stockouts but no true demand, so they cannot score a demand-recovery model. The synthetic world fixes that. We generate a fictional UAE dark-store operator (8 stores × 40 SKUs × 1,400 days, Jan 2023 to Oct 2026, hourly) whose **true demand is known**. We then run the operator's **legacy replenishment rule (P0)** over it, hour by hour. P0 orders from recorded sales only, so stockouts censor its history exactly as they do in FreshRetailNet. The censored history is what Part 3 learns from, and the known true demand is what it is scored against.

## 2. How to run it

```bash
python pipeline/run.py --step part2       # routes → generate → simulate → fidelity (about 15 s)
python -m pytest pipeline                  # 35 Part 2 tests, including the golden reproduction
```

The same seed (`config.yaml: seed: 2026`) reproduces the same world bit-for-bit. A re-run changes only the `generatedAt` timestamps of the committed files. Every random draw comes from a **named stream** (`world.rng_for`), so adding a new stream never shifts an existing one.

## 3. True demand

Daily true demand is negative binomial (gamma-Poisson) with mean

```
λ(s,k,t) = base(k) × size(s) × affinity(s,k) × weekly(t) × festival(c,t) × weather(e,t)
           × promotion(k,t) × stockpiling(c,t) × store shock(s,t) × spikes(s,k,t)
```

for store *s*, SKU *k*, category *c*, emirate *e* and day *t*. The hourly split follows the calibrated intraday profile (the Ramadan profile on Ramadan days), with Dirichlet noise.

| Component | Basis | Source |
|---|---|---|
| Weekly index (Saturday–Sunday weekend) | REAL | `calibration.json` `uae.weekly` |
| Intraday profiles (normal, Ramadan) | REAL (the Ramadan shift is flagged there) | `calibration.json` `uae.intraday_profile_*` |
| Festival dates | REAL, every date cited | `data/external/uae_calendar.csv` |
| Festival build-up **shape** | REAL (Kaggle Lunar New Year curve, shifted one day: its eve is a closure) | `calibration.json` `veg.lunar_new_year_shape` |
| Eid holiday dip **shape** | REAL (FRN-LT Spring Festival); scale 0.5 is an ASSUMPTION | `calibration.json` `frnlt.spring_festival_shape` |
| Ramadan-season **amplitude** | ANCHOR: solved so the 8-week Ramadan season = **19.0%** of annual demand (target 19%) | NielsenIQ via Communicate Online (2026) |
| Weather effect | REAL UAE weather (Open-Meteo) × REAL FRN-LT coefficients, applied to deviations from the seasonal norm, capped at ±6 °C and 20 mm | `weather.json`, `calibration.json` |
| Promotions | Calendar ASSUMPTION (16 episodes/SKU/year, 3–7 days, 10–30% off); response REAL (FRN-LT coefficients) | `config.yaml`, `calibration.json` |
| 2026 stockpiling wave (from 1 Mar 2026, 7 days) | ANCHOR: solved so Ramadan 2026 volume is **+4.1%** on Ramadan 2025 (target +4.1%; −2.3% without the wave) | Worldpanel via Rana (2026) |
| Store shocks, store-wide surges, item spikes, noise CV | TUNED to the fidelity bands (§6) | `config.yaml` `world.demand` |
| Base demand, store sizes, store-SKU affinity | ASSUMPTION | `world.py`, `config.yaml` |

## 4. The operator and its suppliers

- **Stores:** 8 fictional dark stores in real areas of Dubai (5), Sharjah (1) and Abu Dhabi (2).
- **SKUs:** 40 in 9 categories (leafy greens, berries, stone fruit, salad vegetables, dairy, bakery, poultry, dates, fruit). Shelf prices and case packs are ASSUMPTIONS. Unit costs = price ÷ a markup drawn from the **REAL** Kaggle retail/wholesale distribution for the matching vegetable category (the overall distribution otherwise). Planning shelf lives come from USDA FoodKeeper (D-17).
- **Hero series:** 4 stores × 10 SKUs (40 pairs) get series files and appear in the Scenario Console.
- **Suppliers:** 9 fictional suppliers on real routes (D-18, plus `sup-local-bakery`; see D-22). Orders placed at the 22:00 review arrive at 06:00, `lead` days later, unless late (+1 or +2 days), short (50–90% of the order) or missed. **Hormuz 2026** (orders placed 1 Mar to 31 May 2026): sea and air importers switch to longer lead times and far more late, short and missed deliveries (ASSUMPTION informed by Goharbakhsh et al., 2026, and Sohail, 2026; D-20: modelled through availability and lead times, not prices).

## 5. The hourly engine and the P0 rule

**Engine (`simulate.py`), every hour, for all 320 series at once:**
1. **06:00 stock-in.** Deliveries arrive. A beta-distributed share of each delivery is culled for quality on receipt (handling loss, by category).
2. **Sales.** Customers buy the oldest stock first (FIFO), up to what is on hand. The rest of their demand is **lost**, never recorded.
3. **Stock flags.** An hour is flagged out of stock when nothing is left at its end, the same meaning as FreshRetailNet's `hours_stock_status`. An hour that runs out is a censored "transition hour" with some sales.
4. **22:00 review.** The policy orders. Delivery outcomes are sampled from the supplier's terms.
5. **Midnight expiry.** Stock at the end of its shelf life is thrown away.

**Waste = handling loss + expiry.** The ledger satisfies opening + receipts − sales − waste = closing on every series-day, and this is asserted inside every run.

**P0, the legacy rule** (D-21, D-22). The order-up-to level is

```
S = max( (1 + 0.20) × Σ_{j=1..L+R−1} avg28(recorded sales, same weekday as t+j) × (1.25 if promo on t+j)  ÷ (1 − handling loss),
         1 case )
order = round_to_case(S − on hand − on order)
```

- It covers L + R − 1 days, because an order placed at 22:00 lands at dawn L days later and the night between carries almost no demand.
- **What P0 cannot see:** lost demand (it learns only from recorded sales), festivals, weather, expiry, supplier disruption, and promotion depth (a flat +25% for any promotion). These are the gaps the AI policies close in Parts 3–4.

**Worked example** (`test_p0_order_worked_example`). Flat recorded sales of 10 a day, lead time 3, a 10% handling loss and a case of 6: S = 1.2 × 30 ÷ 0.9 = 40. With 7 units on hand and 12 on order, the need is 21 units = 3.5 cases, which rounds half up to **4 cases = 24 units**.

## 6. Fidelity: does the world behave like real fresh retail?

Every synthetic statistic is measured with **the same Part 1 functions** that measured the real data, on what an analyst would see (recorded sales and stock flags, not the hidden true demand). Basis: **emergent** = nothing was tuned to hit it; **tuned** = a named parameter was set to land in the band; **anchored** = an amplitude was solved to match a cited figure.

| Check | Synthetic (P0) | Band | Real | Basis |
|---|---|---|---|---|
| Trading hours out of stock | 21.0% | 15–25% | FRN-50K 19.9% · LT 22.2% | emergent |
| SKU-days with a stockout | 41.1% | 35–50% | 44.3% · 48.2% | emergent |
| All-day outages | 5.4% | 2–6% | 4.0% · 5.5% | tuned |
| Out of stock at 07:00 | 0.5% | ≤ 5% | 1.0% · 1.4% | emergent |
| Out of stock at 20:00 | 36.2% | 25–40% | 36.2% · 38.7% | emergent |
| Morning demand ratio (sold out after 14:00 vs in stock) | 1.43 | 1.15–1.50 | 1.46 · 1.22 | emergent |
| Weekend day index | 1.18 | 1.15–1.30 | 1.18 · 1.19 | emergent |
| Median daily-sales CV | 0.43 | 0.40–0.70 | 0.48 · 0.53 | tuned |
| Store spike p95 (true demand) | 1.45 | 1.40–1.80 | Kaggle 1.64 | tuned |
| Store spike p99 (true demand) | 1.93 | 1.80–2.40 | Kaggle 2.08 | tuned |
| Spoilage, leafy greens | 12.3% | 6–14% | Kaggle target 12.5% | tuned |
| Spoilage, salad vegetables | 7.6% | 6–14% | Kaggle target 7.7% | tuned |
| **Anchor:** Ramadan-season share | 19.0% | ± 0.5 pt | 19% (NielsenIQ) | anchored |
| **Anchor:** Ramadan 2026 vs 2025 | +4.1% | ± 0.2 pt | +4.1% (Worldpanel) | anchored |

**Result: 12/12 bands and 2/2 anchors pass** (also on seeds 42, 1234 and 99). Further diagnostics in the report:
- the first-stockout-hour distribution correlates at **0.80** with FreshRetailNet-50K over trading hours;
- the in-stock intraday profile is within **0.3 pt** of the calibrated profile at every hour;
- **22.1% of true demand is lost** under P0. This is the hidden demand the AI has to recover.

**Why the spike bands are checked on true demand (D-23).** The band is a property of demand. The Kaggle store could stock up before known peaks, so its sales show demand spikes. The festival-blind P0 rule caps them in recorded sales (store p95 1.36, p99 1.51). Both numbers are in the report.

**Stress windows under P0** (diagnostics, CALIBRATED SYNTHETIC):

| Window | Availability | Fill rate (sold ÷ true demand) |
|---|---|---|
| Dec 2025–Feb 2026, sea/air SKUs | 78.9% | 77.1% |
| **Hormuz 2026 (Mar–May), sea/air SKUs** | **19.2%** | **18.4%** |
| Ramadan 2026, all SKUs | 62.8% | 58.7% |
| Summer 2025, all SKUs | 83.8% | 84.1% |

The Hormuz collapse is the legacy rule's blind spot: it keeps assuming the normal lead time and never switches supplier. Its size depends on the **assumed** disruption terms in `world.py`, so the report must present it as an illustration of the mechanism, not as a forecast.

## 7. Verification record

| What | How | Result |
|---|---|---|
| Ledger identity, opening = previous closing, sales ≤ demand, no negative stock, flags = (on hand = 0) | `simulate.check_invariants`, run on every simulation | Holds for all 10.75 M hourly steps |
| Hand-worked engine examples (FIFO, P0 order, weekday averages, promotion uplift, minimum stock, late/missed/short deliveries, expiry timing, censoring) | `test_generate_simulate.py` (11 tests) | Pass |
| Generator worked examples (supply terms, log-normal fit, unit cost, promotion response, festival shapes) and anchors | `test_generate_world.py` (18 tests) | Pass |
| Reproducibility | Same seed → identical `demand_h` checksum; a different seed changes it; save → load round trip; **the committed `fidelity_report.json` reproduces from code** | Pass |
| Fidelity | `test_generate_fidelity.py` (6 tests) | 12/12 bands, 2/2 anchors |

## 8. Limitations

- The operator and every ASSUMPTION parameter are fictional. The world is a **test bench** for methods, not a description of a real UAE retailer.
- Handling-loss rates outside the two vegetable categories are assumptions: the real loss data covers vegetables only.
- The Hormuz 2026 delivery terms are assumptions, informed by the cited transit collapse. The stress-window numbers depend on them directly.
- School summer-break windows come from news reports (KI-7). They shape a synthetic demand dip only.

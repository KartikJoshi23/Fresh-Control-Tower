# 05 · Models: demand recovery, forecasts, ablation and spike detection (Part 3)

> **Tasks:** P3-01 (recovery), P3-02 (real-data masking test), P3-03 (forecasts), P3-04 (ablation, KQ2), P3-05 (spike detector).
> **Code:** `pipeline/freshpipe/{recover,masking,forecast,spikes}.py`. **Run:** `python pipeline/run.py --step part3` (about 7 minutes on a laptop; `realdata` needs `Datasets/FreshRetailNet-50K/`, and is skipped otherwise).
> **Outputs:**
> - `web/public/data/realdata.json` (**REAL**), `web/public/data/ablation.json` (**PRECOMPUTED**): both committed, and no longer fixtures;
> - `data/processed/model_report.json`: every metric below, committed (report Appendix B);
> - `data/synthetic/{recovered,forecasts}.npz`: gitignored, rebuilt from the seed.
>
> Synthetic results are scored against the **known true demand** of the calibrated synthetic world (docs/04). Real results use FreshRetailNet-50K, which has no true demand, so they use masking.

## 1. Results against the plan's targets (plan §1.2)

| Target | Result | Verdict |
|---|---|---|
| **Real:** the naive forecast bias is reproduced in the paper's direction (about −7%), then cut to within ±2% after recovery | WPE on in-stock hours: **−18.9%** trained on raw sales → **−0.4%** trained on recovered demand. On fully in-stock days only, the raw-sales bias is −8.6% (those days are quieter, so this view under-states it). | ✅ direction and correction |
| **Real:** recovery accuracy reported against the paper's best masked recovery (WAPE 27.6%, TimesNet) | Hidden-demand WAPE **58.4%**, bias **+1.9%**. Oracle floor 31.4%. | Reported. The simple profile method is much less precise on sparse real hourly data, but nearly unbiased, and bias is what the forecast needs. |
| **Synthetic:** recovered demand, WAPE ≤ 25% on stockout hours | Hidden demand per series-day: **27.0%** (validation), **30.5%** (2026 test). Oracle floor 13.9%. Hour by hour: 61%, vs an oracle of 60%. | ❌ narrowly missed (see §2) |
| **Synthetic:** recovered demand, bias within ±3% | Daily bias **−1.5%** in 2026 (recorded sales: **−32.4%**) | ✅ |
| **Forecast** WAPE better than seasonal-naive and the moving average | 1–7 days: **30.5%** vs 44.4% (seasonal-naive), 36.0% (28-day MA), 34.5% (ETS). Every bucket wins. | ✅ |
| **Forecast** P10–P90 band covers 75–85% | **77.9%** (1–7 d), 78.4% (8–14 d), 78.4% (15–35 d) | ✅ |
| **Spikes:** median delay ≤ 4 trading hours; ≤ 1 false alarm per store-week | Store-level detector: **3 h**, **0.19** false alarms per store-week, 54% of store-wide events caught. Item level: 7 h and 1.1 false alarms per store-week. | ✅ store level · ❌ item level |

## 2. Demand recovery (P3-01)

**Method: profile imputation.** For each series-day:

```
level = (in-stock sales + α × prior) ÷ (profile mass of the in-stock hours + α)
hidden hour h  →  max(sales in h, level × profile share of h)
```

- **Profile.** The series' intraday profile, estimated from fully in-stock days in the training window (Jan 2023–Jun 2025) and shrunk towards its category with 50 pseudo-units. Ramadan days use the category's Ramadan shape.
- **Prior.** The mean recovered demand of the last four same weekdays.
- **α (a pseudo-mass).** Chosen on the Jul–Dec 2025 validation window: **α = 0.10**, from the grid 0, 0.05, 0.1, 0.2, 0.4.
- **Transition hours.** These are flagged hours that still sold something; their sales are a lower bound, never replaced by less.

**Worked example** (`test_profile_recovery_worked_example`). The shelf is in stock 00:00–11:59, selling 2 units an hour: 24 units over half the profile mass, so level = 24 ÷ 0.5 = 48. Each of the 12 empty hours gets 48 ÷ 24 = 2. Hour 12 sold 1 before emptying, so it keeps max(1, 2) = 2. The recovered day is 24 + 24 = **48**.

**The ML alternative** (HistGradientBoosting, Poisson loss, trained on in-stock hours with a leave-this-hour-out level) was tried. It over-estimates: hidden WPE +7.0% on validation and +27.9% in 2026, with a worse WAPE. The plan keeps the simplest method that works, so **profile imputation is used**.

| Synthetic, scored against true demand | Validation (H2 2025) | Test (2026) |
|---|---|---|
| Recorded sales vs true demand (the censoring bias) | −18.3% | −32.4% |
| **Recovered vs true daily demand** | **−1.2%** | **−1.5%** |
| Hidden demand per stockout series-day: WAPE / bias | 27.0% / −5.8% | 30.5% / −4.2% |
| Whole stockout days: WAPE | 8.6% | 14.5% |
| Hour by hour on stockout hours: WAPE | 60.9% | 61.4% |

**Why the 25% target is narrowly missed.** The oracle below is an upper bound on any method that estimates a day level and splits it by a profile:
- even an oracle that knows each day's **true** total, split by the profile, gets 13.9% hidden-demand WAPE and **60%** hourly WAPE;
- hour-level error is therefore pure noise (Poisson counts and intraday randomness), and our recovery sits at that floor;
- the remaining gap is the uncertainty in the day level when only a few morning hours are seen.

The bias, which is what the forecaster actually inherits, is within target.

## 3. Real-data validation on FreshRetailNet-50K (P3-02)

**Masking test.**
- **Days masked.** 642,130 fully in-stock series-days in the last 30 training days (27 May–25 Jun 2024).
- **How.** Each gets an artificial stockout from a first hour drawn from the real distribution of first stockout hours (07:00–21:00) through midnight. Real stockouts are 88–99% contiguous once they start (measured), so masking to midnight is realistic.
- **Profiles.** These come from the first 60 days only.
- **α.** The synthetic value, 0.10. **Nothing is tuned on the real data.**

| | Hidden-demand WAPE | Bias (WPE) |
|---|---|---|
| Profile recovery (α = 0.10) | **58.4%** | **+1.9%** |
| Oracle (true day total × profile) | 31.4% | n/a |
| Sensitivity on validation masks: α = 0 / 0.4 / 0.8 | 67.3% / 54.6% / 53.8% | +0.3% / +10.3% / +12.6% |

**Why it is lower than on synthetic data.** FreshRetailNet is sparse at hour level: 62% of in-stock trading hours sell nothing, and sales are scaled. A day's level is therefore hard to read from a few morning hours. A larger α trades bias for accuracy, so we keep the bias-safe synthetic value.

**Forecast bias test.**
- **Setup.** The same global gradient-boosted model is trained twice on the 90-day training split, once on raw daily sales and once on recovered demand. Both forecast the 7-day evaluation split (26 Jun–2 Jul 2024).
- **Scoring.** The evaluation days are censored too, so both forecasts are scored on **in-stock hours only**: forecast × the profile mass of those hours vs their sales. This keeps busy days in the test; scoring whole in-stock days would drop them and bias the truth low.

| Trained on | WPE (in-stock hours) | WAPE (in-stock hours) | Paper (TFT, Wang et al., 2025) |
|---|---|---|---|
| Raw sales | **−18.9%** | 35.0% | WPE −7.37%, WAPE 31.75% |
| Recovered demand | **−0.4%** | 32.1% | WPE +0.57% (iTransformer) / +2.58% (TimesNet) |

**Conclusion.** The direction and the correction match the paper. Our raw-sales bias is larger because our evaluation keeps the busy days. Recovery adds 30% to the training volume.

## 4. Forecasts (P3-03)

**Model.**
- Nine `HistGradientBoostingRegressor` models with quantile loss (P10/P50/P90 × buckets of 1–7, 8–14 and 15–35 days).
- Fitted on Jan 2023–Dec 2025 with fixed hyperparameters (no search). Lags are multiples of 7 at or beyond each bucket's longest horizon; `test_features_never_see_the_forecast_lead_time` proves there is no leakage.

**Features.**
- **History:** lags, 7- and 28-day means and series identity.
- **Calendar:** weekday, day of year, signed days from Ramadan, each Eid and National Day (these handle the 11-day lunar shift), the Ramadan day index, event phase, public holidays and the summer break.
- **Promotions and price:** the announced promotion depth and the shelf price.
- **Weather:** the real UAE daily temperature and rain, used in the 1–7 day bucket only.

**Scale.** The target and the lags are ratios to the series level (floor 0.5 units/day), and rows are weighted by that level, so the loss is in units. Quantiles are sorted, so they never cross.

**2026 test, scored against true demand:**

| 1–7 days | WAPE | Bias | Coverage P10–P90 |
|---|---|---|---|
| **AI, trained on recovered demand** | **30.5%** | −5.9% | **77.9%** |
| AI, trained on recorded sales (naive) | 42.5% | −31.0% | 53.0% |
| Legacy 28-day MA of recorded sales (the P0 input) | 44.8% | −31.6% | n/a |
| Seasonal-naive (recovered) | 44.4% | −1.4% | n/a |
| 28-day MA (recovered) | 36.0% | −1.4% | n/a |
| ETS, additive weekly season (recovered) | 34.5% | −1.4% | n/a |

**Why the P50 sits 5.9% low.** The P50 is a median, and daily demand is right-skewed (negative binomial), so the median lies below the mean. The ordering policy in Part 4 uses the quantiles, not the P50 alone.

**By stress window** (1–7 days, AI WAPE / bias / coverage):

| Window | WAPE / bias / coverage | Note |
|---|---|---|
| Normal (Jan–Feb 2026) | 29.8% / −4.6% / 79.6% | |
| Ramadan 2026 | 32.3% / −13.8% / 72.2% | Ramadan uplift under-forecast |
| Stockpiling (1–7 Mar 2026) | 36.5% / −28.1% / 61.4% | Unannounced, so a forecast cannot know it: this is what the spike detector is for |
| Hormuz (Mar–May 2026) | 31.4% / −5.6% / 76.4% | |
| Summer 2026 | 30.2% / −4.2% / 79.0% | |

**By category,** WAPE ranges from 29.9% (salad vegetables) to 32.3% (dates); coverage is 77–79% everywhere.

## 5. Which data matters (P3-04, KQ2)

The 1–7 day P50 model is retrained without each feature group, scored on the 2026 test against true demand (`ablation.json`). The full model scores WAPE 30.5%.

| Without… | ΔWAPE | ΔBias | Reading |
|---|---|---|---|
| **Stock status** (trained on recorded sales) | **+11.9 pts** | −25.1 pts | The single most valuable data: without it, an empty shelf looks like no demand |
| Everything except sales history | +3.6 pts | | Context adds about 4 points on top of history |
| Calendar and festivals | +3.0 pts | | Ramadan, Eid and weekday timing |
| Promotions and price | +1.3 pts | | Announced promotions |
| Weather | 0.0 pts | | The real UAE weather effect is small (about 1.4% per °C of anomaly) |

**Supplier lead time** feeds the ordering decision (Part 4), not the demand forecast, so it is not in this table. KQ2 appears twice in the brief; it is answered once, here.

## 6. Spike detection (P3-05)

**Method.**
- Every trading hour, a **Poisson CUSUM**, S = max(0, S + a·ln r − (r − 1)·e), compares actual sales *a* with expected demand *e* (P50 × intraday profile).
- A **ratio guard** also requires cumulative actual ÷ expected ≥ ratio_min.
- **Tuning.** On Jul–Dec 2025 labelled spikes, with a forecast fitted on data to Jun 2025 only, so the thresholds see out-of-sample error. The rule is the best detection with ≤ 1 false alarm per store-week.
- **Worked example** (`test_poisson_cusum_worked_example`). Expected demand is 1 unit an hour and actual is 4. With r = 2, S grows by 4 ln 2 − 1 = 1.77 an hour and passes H = 5 after the third hour.

| 2026 test | Detected | Median delay | False alarms / store-week |
|---|---|---|---|
| **Store level** (40 SKUs pooled; store-wide surges and stockpiling) | **54%** | **3 h** | **0.19** |
| Item level, all labelled events | 12% | 7 h | 1.1 |
| Item level, by size: 1.25–1.5× / 1.5–2× / 2–3× / ≥ 3× | 3% / 12% / 33% / **73%** | | |
| Item level on the **censored P0 stream** (shelves often empty) | 4% | 4 h | 0.5 |

**Reading.**
- **Single-SKU spikes.** Day-to-day noise (CV about 0.34) is as large as most of these spikes, so only big ones (≥ 3×) are caught reliably at an acceptable false-alarm rate.
- **Store-wide surges.** Pooling the SKUs cancels the noise, and the store detector meets the plan's targets.
- **Visibility.** On the legacy shelf, stockouts hide the surge itself, and detection collapses to 4%. This is direct evidence for KQ3: **real-time stock visibility is a precondition for spike response.**

## 7. Verification record

| What | How | Result |
|---|---|---|
| Recovery arithmetic (worked example, the α blend, the lower bound, profile shrinkage, metrics) | `test_models_recover.py` | Pass |
| Masking helpers on a hand-built cube (the first-hour distribution, mask placement, exact recovery of a regular series, no bias without censoring) | `test_models_recover.py` | Pass |
| The committed synthetic recovery report reproduces from the seed | `test_synthetic_recovery_reproduces_the_committed_report` | Pass |
| The real masking numbers reproduce (needs `Datasets/`) | `test_masking_test_reproduces_the_committed_numbers` (marked `data`); `--step realdata` run twice with identical results | Pass (locally) |
| No leakage in any forecast bucket | `test_features_never_see_the_forecast_lead_time` | Pass |
| Quantiles never cross; worked examples for the baselines, ETS, pinball and coverage | `test_models_forecast.py` | Pass |
| Worked examples for the CUSUM, the alarm metrics and the false-alarm cap | `test_models_forecast.py` | Pass |
| Golden checks: forecast beats every baseline and covers 75–85%; recovery bias within ±3%; ablation ranks stock status first; the store detector meets its targets | `test_models_forecast.py` | Pass |

## 8. Limitations

- **One synthetic world.** Synthetic results come from one seeded world. Part 4's Monte Carlo varies supply and handling draws, but the demand world is the same.
- **Different protocols.** The real-data comparison with the paper is directional: different models, a different masking protocol and a different evaluation.
- **Weather lead.** Weather enters the 1–7 day bucket as the actual value, a stand-in for a one-week weather forecast.
- **P0 history for later policies.** The AI policies in Part 4 use forecasts built from the recovered P0 history. Recovery is nearly unbiased, so this approximates what each policy would learn from its own history.

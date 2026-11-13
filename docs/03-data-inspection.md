# Phase 3a: Dataset Inspection Report

> **Group 1 · AI for Inventory Management** · Inspected 13 Nov 2026
> The inspection was read-only. The scripts ran outside the repo and will be rebuilt as tested pipeline code in Phase 5, Part 1.
> Every number below was measured on the files in `Datasets/`.

---

## 1. Files verified

| Dataset | Path | Size | Check | Licence |
|---|---|---|---|---|
| FreshRetailNet-50K (train) | `Datasets/FreshRetailNet-50K/train.parquet` | 106,436,287 B | Byte-exact match with Hugging Face | CC BY 4.0 |
| FreshRetailNet-50K (eval) | `Datasets/FreshRetailNet-50K/eval.parquet` | 8,440,124 B | Byte-exact match with Hugging Face | CC BY 4.0 |
| FreshRetailNet-LT (train) | `Datasets/FreshRetailNet-LT/train.parquet` | 315,398,578 B | SHA-256 `e744c537…f1e3` ✅ (downloaded by Claude on 13 Nov 2026) | CC BY 4.0 |
| FreshRetailNet-LT (eval) | `Datasets/FreshRetailNet-LT/eval.parquet` | 2,009,424 B | SHA-256 `370ca7f9…d626` ✅ | CC BY 4.0 |
| Kaggle vegetables: items | `Datasets/Kaggle-Vegetables/annex1.csv` | 16,597 B | Matches Kaggle listing | CC BY-NC-SA 4.0 |
| Kaggle vegetables: transactions | `Datasets/Kaggle-Vegetables/annex2.csv` | 51,794,172 B | Matches Kaggle listing | CC BY-NC-SA 4.0 |
| Kaggle vegetables: wholesale prices | `Datasets/Kaggle-Vegetables/annex3.csv` | 1,843,940 B | Matches Kaggle listing | CC BY-NC-SA 4.0 |
| Kaggle vegetables: loss rates | `Datasets/Kaggle-Vegetables/annex4.csv` | 10,805 B | Matches Kaggle listing | CC BY-NC-SA 4.0 |

**Tooling available locally:**
- Python 3.11.2 with pandas 2.3.3, pyarrow 23.0.0, numpy 2.4.6, scipy 1.17.1, scikit-learn 1.8.0 and statsmodels 0.14.6 (LightGBM is not installed);
- Node 22.21.1, npm 9.6.4, git 2.51 and the GitHub CLI 2.87.

---

## 2. FreshRetailNet-50K

### 2.1 Structure

- **Size and layout.** 4,500,000 training rows and 350,000 evaluation rows, 19 columns each. One row is one store, one SKU and one day.
- **Hierarchy.** 18 cities contain 898 stores. Stores per city range from 3 to 290 (median 18.5), and SKUs per store from 1 to 164 (median 50).
- **Products.** 865 SKUs in a category hierarchy of 7 management groups, then 32, 84 and 233 category levels.
- **Series.** **50,000 store-SKU series, each exactly 90 days** (28 Mar to 25 Jun 2024), with no gaps and no duplicate rows. The evaluation split covers the same 50,000 series over 26 Jun to 2 Jul 2024.
- **Columns:**
  - IDs: `city_id`, `store_id`, `management_group_id`, `first/second/third_category_id`, `product_id`;
  - `dt` (string date);
  - `sale_amount`, the daily sales, scaled;
  - `hours_sale`, a list of 24 hourly sales values (it sums exactly to `sale_amount` in 100% of rows);
  - `hours_stock_status`, a list of 24 flags, one per hour;
  - `stock_hour6_22_cnt`;
  - `discount`;
  - `holiday_flag` and `activity_flag`;
  - `precpt`, `avg_temperature`, `avg_humidity` and `avg_wind_level`.
- **Completeness.** There are no nulls in any column.

### 2.2 Key findings

| # | Finding | Evidence |
|---|---|---|
| F1 | **In `hours_stock_status`, 1 means OUT of stock and 0 means in stock.** The paper's notation is the reverse, so our data contract states the encoding explicitly. | The count of 1s in hours 06:00–21:59 equals `stock_hour6_22_cnt` in **100%** of rows, and 97.5% of all sales occur in hours flagged 0. |
| F2 | **19.9% of trading hours (06:00–22:00) are out of stock.** This matches the "~20%" stated on the dataset card. | The mean of `stock_hour6_22_cnt` is 3.18 out of 16 hours. |
| F3 | **44.3% of SKU-days have at least one stockout hour, and 4.0% are out of stock for the whole trading day.** | 181,791 rows show 16 of 16 hours out of stock. |
| F4 | **Stockouts build through the day.** Excluding all-day outages, 1.0% of SKUs are out at 07:00, rising to 36% at 20:00 and about 39.5% by 22:00. The first stockout most often happens at 17:00. | Hourly flag shares. The paper quotes "<2% at 6 AM … 26% by 8 PM". Our measure (all rows except all-day outages) differs, so we will report ours and explain the method. |
| F5 | **Stockouts hit the highest-demand days, which is where censoring hides the most demand.** On days that sold out after 14:00, morning sales (06–12) were **46% higher** than on days with no stockout. | 0.574 vs 0.392 (scaled units). |
| F6 | 2.5% of all sales fall in hours flagged out of stock, meaning stock ran out during the hour. We treat these as censored "transition hours". | Hourly cross-tabulation. |
| F7 | **Sales are scaled** by an undisclosed coefficient: mean 1.00, median 0.70, p99 5.8, max 44.9. Only 4.5% of days have zero sales. The median coefficient of variation per series is 0.51 (p90 0.83). | Descriptive statistics. |
| F8 | **Discounts are common** (51.5% of days have a value below 1.0), but there are anomalies: **16,039 rows (0.36%) have `discount = 0.0`** and 34 rows are above 1.0. `activity_flag` is set on 37.8% of days. | Value counts. |
| F9 | `holiday_flag` marks weekends and Chinese public holidays (31 dates in the window). Make-up working days are handled inconsistently: 28 Apr and 11 May 2024 are flagged. | Date list. |
| F10 | **Weekly pattern:** Saturday and Sunday index at about 1.18–1.20, weekdays at 0.87–0.96. Holiday days average 1.16 against 0.91 otherwise. | Day-of-week means. |
| F11 | Weather varies **by store** within a city: temperature differs across rows on 92.7% of city-days. | Within-city standard deviation. |
| F12 | Intraday sales have a morning peak at 08:00–10:00 (10.7% of the day falls at 09:00) and a second peak at 15:00–16:00. | Hourly sales shares. |

---

## 3. FreshRetailNet-LT

| Item | Result |
|---|---|
| Size | 7,869,549 training rows and 70,000 evaluation rows (10,000 series, 14–20 Jul 2025) |
| Coverage | **22,939 series**, 1,057 stores, 18 cities and 576 SKUs, spanning **5 Jun 2023 to 13 Jul 2025** (770 dates) |
| Series length | Varies from 42 to 770 days (median 392). **25% of series cover at least 728 days.** 8,022 series have internal date gaps. |
| Schema | Same 19 columns, but the column order differs and `hours_stock_status` is int32, so loaders must select columns by name |
| Stockouts | Same encoding (F1 holds in 100% of rows). 22.2% of trading hours are out of stock, 48.2% of days have at least one stockout hour, and 5.5% are all-day outages. |
| Censoring evidence | On days that sold out later, morning sales were **22% higher** (0.85 vs 0.695) |
| Discounts | Range 0.30–1.00 with no anomalies; 38.7% of days are discounted |
| Seasonality | The monthly index runs from summer highs (Jul 2023: 1.26; Jul 2024: 1.24) to winter lows (Jan 2025: 0.66). **Caveat:** the mix of series changes over time, so seasonality must be estimated within each series, not from raw totals. |
| Use | Long-run seasonality and Chinese festival shapes (Spring Festival, Golden Week), plus a second validation set |

---

## 4. Kaggle "Supermarket Sales Data" (vegetables)

| Item | Result |
|---|---|
| `annex1.csv` | 251 items in 6 categories: Leaf vegetables 100, Edible mushroom 72, Capsicum 45, Aquatic tuberous 19, Solanum 10, Cabbage 5. **4 item names are duplicated** under different codes, so the item code is the key. The category name contains a **non-breaking space**. |
| `annex2.csv` | **878,503 transactions, 1 Jul 2020 to 30 Jun 2023.** Sales occur on 1,085 of 1,095 days. **The 10 days with no sales** are Chinese New Year eve or day in 2021–2023, plus 6 days in Nov–Dec 2022; these are closures, not zero demand. The file also has **461 returns** (negative kg) and **132 unparseable time stamps**. The median line is 0.44 kg, but **the maximum is 160 kg**, an outlier. The median price is 7.9 RMB/kg, and 5.4% of transactions are discounted. |
| Intraday | Peaks at 10:00–11:00 (13.6% of daily kg) and 17:00–18:00 (10.4%). The store trades from about 09:00 to 22:00. |
| Daily volume | Mean 434 kg per day, p95 771 kg. The weekend index is 1.22–1.28. |
| **Real spikes** | Daily kg divided by the 28-day rolling median gives **p95 1.64×, p99 2.08×, max 5.13×** (19 Nov 2022), with 4.08× on 21 Nov 2022. **The lead's "200 → 500" (2.5×) scenario sits inside the real observed range.** |
| **Festival shape** | Chinese New Year: the pre-festival week runs at **1.8–2.5× baseline**, the store closes on the eve or day, and the post-festival week runs at 1.3–1.5×. |
| Regime shifts | The monthly index ranges from 0.49 to 1.69, which points to structural changes (for example, Nov 2021 is low and Aug 2022 is high). Shapes are used within each year only. |
| `annex3.csv` | 55,982 daily wholesale prices. **Every one of the 46,599 sold item-days has a wholesale price.** The **retail/wholesale ratio has a median of 1.66** (p10 1.36, p90 2.23), varying by category from 1.51 to 1.71. 1.3% of item-days were sold below cost (clearance). |
| `annex4.csv` | Loss (spoilage) rate for all 251 items: 0–29.25%, mean 9.4%. **Weighted by kg sold it is 9.9%**: Leaf 12.5%, Cabbage 10.9%, Aquatic 8.2%, Capsicum 8.1%, Mushroom 6.8%, Solanum 6.4%. |

**Early insight (calculation shown).** At the median markup of 1.66× cost with no salvage value:
- the gain from one extra unit sold is Cu = 0.66c;
- the loss from one unit unsold is Co = c;
- the critical ratio is Cu / (Cu + Co) = 0.66 / 1.66 ≈ **0.40**.

So for a one-day, no-salvage perishable, the profit-optimal chance of being in stock is far below the reflexive "99%". The extra stock needed for high availability has to be justified by goodwill and lost-customer costs. The optimiser will make that trade-off explicit (plan §4).

---

## 5. Gaps that no dataset fills

These confirm the Phase 2 plan for a synthetic layer.

| Gap | 50K | LT | Kaggle vegetables |
|---|---|---|---|
| Inventory **quantities**, receipts (stock-in) | ✗ (flags only) | ✗ | ✗ |
| Prices and costs | ✗ | ✗ | ✅ (RMB) |
| Spoilage | ✗ | ✗ | ✅ (average rate per item) |
| Suppliers and lead times | ✗ | ✗ | ✗ |
| Multi-year seasonality | ✗ (90 days) | ◐ (fragmented windows) | ✅ (one store, 3 years) |
| Gulf festivals, UAE weather | ✗ | ✗ | ✗ |
| Multiple stores | ✅ | ✅ | ✗ |

---

## 6. Cleaning specification

These rules are implemented and unit-tested in Phase 5, Part 1.

| ID | Dataset | Rule |
|---|---|---|
| C1 | FRN | Decode the stock flag: `oos = hours_stock_status == 1`. Derive the in-stock hour mask, the out-of-stock hour count and the first stockout hour. |
| C2 | FRN | Mark hours that are flagged out of stock but have sales as **censored transition hours**. Their sales are a lower bound on demand. |
| C3 | FRN | Mark all-day outages (16 of 16 hours) as **unavailable**: demand is unknown, not zero. |
| C4 | FRN-50K | Set `discount == 0.0` to missing and cap values above 1.0 at 1.0. Report the counts (16,039 and 34). |
| C5 | FRN | Split `holiday_flag` into a weekend flag and a public-holiday flag using the date. Record the inconsistency with make-up working days. |
| C6 | FRN | Keep sales **relative**. Never convert to units, and report real-data results as percentages. |
| C7 | LT | Select columns by name, harmonise dtypes, reindex each series to a daily grid, and mark missing days as missing, not zero. |
| C8 | FRN | Process in row-group batches with downcast dtypes. Cache tidy tables to `data/interim/` (gitignored). |
| C9 | Kaggle | Normalise whitespace in category names (the non-breaking space). Key on item code, not name. |
| C10 | Kaggle | Net the 461 returns against sales on the same day and item. Drop the 132 rows with unparseable time stamps from the hourly analysis only. |
| C11 | Kaggle | Cap the quantity of a single line at the item's p99.9 for calibration (the 160 kg outlier). |
| C12 | Kaggle | Mark the 10 zero-sale days as **closures**. |
| C13 | Kaggle | Flag item-days sold below wholesale as clearance and exclude them from the markup calibration. |
| C14 | All | Write a provenance tag and source on every derived table. |

---

## 7. Calibration targets for the synthetic UAE layer

For the default baseline policy, the synthetic generator must land inside these bands. The fidelity report will be produced in Part 2.

| Metric | Real value(s) | Target band (synthetic, baseline policy) |
|---|---|---|
| Share of trading hours out of stock | 19.9% (50K), 22.2% (LT) | 15–25% |
| SKU-days with at least one stockout hour | 44.3%, 48.2% | 35–50% |
| All-day outages | 4.0%, 5.5% | 2–6% |
| Out of stock by hour | ~1% at 07:00, ~36% at 20:00 | ≤ 5% at 07:00, 25–40% at 20:00 |
| Morning demand on later-sold-out days vs no-stockout days | 1.46× (50K), 1.22× (LT) | 1.15–1.5× |
| Weekend uplift | 1.18–1.20 (FRN), 1.22–1.28 (Kaggle) | 1.15–1.30, applied to the UAE weekend |
| Coefficient of variation of daily demand per series | 0.51–0.59 | 0.4–0.7 |
| Background spikes (day ÷ 28-day median) | p95 1.64×, p99 2.08× | p95 1.4–1.8×, p99 1.8–2.4× |
| Festival pre-week uplift (reference shape) | Chinese New Year 1.8–2.5× | Ramadan and Eid sizes come from Gulf sources (plan §3.4); the shape comes from this |
| Retail/wholesale ratio | Median 1.66 (p10 1.36, p90 2.23) | Same distribution, varied by category |
| Spoilage under the baseline policy | 6.4–12.5% by category (9.9% overall) | 6–14% of received kg by category |
| Intraday demand profile | Two peaks (morning and late afternoon) | Same, with a Ramadan profile adjustment (stated as an assumption) |

---

## 8. What this means for the plan

1. **The core problem is visible in real data.** Stockouts climb through the day and cluster on high-demand days (F4, F5). The real-data validation (plan §3.5) can therefore show the bias honestly.
2. **The lead's spike scenario is realistic.** A 2.5× surge sits between the real p99 (2.08×) and the observed maximum (5.13×).
3. **Festival effects are large.** Chinese New Year runs at 1.8–2.5× in the pre-festival week, so festival handling is a first-class feature, not an afterthought.
4. **Economics matter.** A critical ratio of about 0.40 means maximising availability is not automatically optimal. The board story becomes "balance, not maximise".

# Phase 1: Brief Analysis and Problem Selection

> **Group 1 · AI for Inventory Management** · SP Jain School of Global Management, MAIB · AI in Operations
> Prepared 13 Nov 2026 · **Status: APPROVED by the project lead on 13 Nov 2026. Candidate A selected.** Next: [02-dataset-selection.md](02-dataset-selection.md)
> This phase contains no planning and no code. This file is the decision record for Phase 1. The Phase 4 decisions log (PROGRESS.md) will link to it.

---

## 1. The brief, restated

Group 1 must:

1. Pick **one real, specific inventory problem**.
2. Design an **AI-driven solution** using machine learning, optimisation and predictive analytics.
3. Prove it with a **working prototype**.
4. Pitch it to a **simulated C-suite board**, with findings and an implementation roadmap.

The board lens is fixed. The pitch must cover:

- what shifts in the **business model**;
- what **technology** we invest in;
- how we **integrate with the ecosystem** (suppliers, logistics and data partners);
- which **operational risks** we take on or remove.

The pitch leads with the recommendation.

### 1.1 Deliverables (confirmed)

| # | Deliverable | What "done" means | Phase |
|---|---|---|---|
| 1 | **Interactive dashboard (the prototype)** | Built with Next.js, React and TypeScript, with Framer Motion. WebGL is used only where it adds real value. Professional dark, glassmorphic, supply-chain visual identity, with horizontal top navigation only (no sidebar anywhere). Responsive and fast, with zero console errors. Hosted on a free tier through GitHub, with heavy computation kept off the host. The location of every computation is stated. Anything synthetic, simulated or precomputed is labelled as such. | 3–5 |
| 2 | **Written report** | LaTeX, compile-ready on Overleaf. Title page with placeholders (course, instructor, members) and a table of contents. Section headers map 1:1 to slides. Answers every key question and boardroom theme. Includes findings, the roadmap, captioned screenshots and Harvard references. Complete enough that no slide needs outside information. The compiled PDF is the single NotebookLM source. | 6 |
| 3 | **NotebookLM prompt** | At most 500 characters, with the exact count stated. Asks for at most 9 slides (target 8–9), a board-level tone, the recommendation first, and light slides built from key numbers and visuals. Comes with a slide-by-slide review brief (title, at most 4 bullets, suggested visual). | 7 |
| 4 | **Collaboration kit** | README with run instructions, PROGRESS.md, MASTER_PROMPT.md and COLLABORATOR_PROMPT.md. Passes the handoff test: a fresh session with only the repo and the collaborator prompt can resume the work without asking questions. | 4 |
| n/a | Supporting artefacts | implementation-plan.md with the traceability table (Phase 3). A screenshots folder with a clear naming convention (Phase 6). | 3, 6 |

### 1.2 Key questions (confirmed, duplicate removed)

| ID | Key question |
|---|---|
| KQ1 | What types of inventory challenges can AI help solve (overstocking, stockouts, seasonal variability)? |
| KQ2 | What data sources are essential for building AI models (historical sales, promotions, external factors)? **⚠ This question appears twice in the brief. We answer it once, thoroughly, and flag the duplication in the report.** |
| KQ3 | What are the benefits of real-time inventory visibility and automated replenishment? |
| KQ4 | How can AI-driven forecasting support sustainability and cost reduction? |
| KQ5 | How can AI support multi-criteria decision-making in procurement? |

**Boardroom themes:**

- B1 business model shift
- B2 technology investment
- B3 ecosystem integration
- B4 operational risk

The pitch also covers findings and the implementation roadmap, with the recommendation first.

### 1.3 Added requirements from the project lead (13 Nov 2026)

| ID | Requirement |
|---|---|
| R1 | Show inventory movements: **stock-in** (receipts) and **stock-out** (sales, waste and stockouts), not only forecasts. |
| R2 | Dashboard **options or sliders to increase or decrease daily orders**. |
| R3 | Data with **multiple demand patterns**: seasonality, festivals and weekly cycles. |
| R4 | **Sudden spikes** (for example, ~200 sold a day suddenly needing 500) and the decision of **how early to stock up**. |
| R5 | **One integrated dashboard** where each scenario is an option, not separate tools. |
| R6 | Use a real dataset if a near-perfect one exists. Otherwise use a **near-real synthetic dataset** calibrated to real datasets and clearly labelled. |

**Reconciling "one specific problem" with "multiple problems".** The brief asks for one specific problem, and the lead wants many situations covered. Both hold if we pick **one anchor problem** that carries the board story. The other challenges (festival peaks, sudden spikes, supply shocks, record errors) then become **scenario levers inside one dashboard**.

---

## 2. Method

**Candidates considered and excluded early**

- *Generic store-sales forecasting* (M5/Walmart, Rossmann). It is heavily overused, and forecasting alone involves no inventory decision.
- *Spare-parts intermittent demand* (maintenance, repair and operations, MRO). It is a real problem, but there is no suitable public data and little festival or seasonal signal.
- *Hospital blood or platelet inventory.* The supply is donated, so procurement multi-criteria decision-making does not fit.

**Scoring.** Each criterion is scored 1–5. The scores are our judgement, and section 3 gives the reasons.

| Criterion | Weight |
|---|---|
| Problem evidence (credible, current, locally relevant) | 15% |
| Key-question coverage (KQ1–KQ5) | 20% |
| Fit with added requirements R1–R5 | 20% |
| Data availability and realism | 15% |
| Dashboard demonstrability | 10% |
| Boardroom angle (B1–B4) | 10% |
| Originality (avoids overused choices) | 10% |

Coverage legend: ● strong · ◐ partial · ○ weak.

---

## 3. Candidates

### Candidate A: Hidden stockouts in UAE fresh grocery, replenishing perishables when festivals, sudden spikes and import disruption collide ⭐ Recommended

**The problem.** Fresh food punishes both mistakes: order too much and it spoils; order too little and shelves go empty. Three forces make this worse for a UAE operator in 2026:

1. **Hidden stockouts (censored demand).** Once an item sells out, recorded sales stop at what was available, so true demand is never recorded. A replenishment system that learns from sales then orders less next time. That causes more stockouts, and the loop reinforces itself. It bites hardest at peaks. If 500 customers want an item but only 300 are on the shelf, the records say 300, and next year's festival forecast starts too low.
2. **Demand swings.** These come from Ramadan and both Eids (which move about 11 days earlier each year on the lunar calendar), weekly cycles, weather, promotions, and unannounced surges such as crisis stockpiling.
3. **Supply swings.** Most UAE food is imported. During the 2026 Hormuz shipping disruption, fresh lead times became longer and less predictable. Perishability also caps how early you can stock up.

**Evidence that it is real**

| Claim | Source | Note |
|---|---|---|
| Forecasts trained on stockout-censored sales under-predict demand by **7.37%** (TFT model). Recovering latent demand brings the bias to **near zero** and improves accuracy by 2.73%. | Wang et al. (2025), arXiv 2505.16319 (v5, Jun 2026) | Benchmark paper from Dingdong. No journal venue is shown. |
| About **20%** of the benchmark's data is stockout-affected. The stockout rate rises from **under 2%** after the 6 am restock to **26% by 8 pm**. | Dingdong-Inc (2025) dataset card; Wang et al. (2025) | The data comes from a fresh e-commerce "frontier warehouse" model with 30-minute delivery, which is close to the dark-store quick-commerce model. |
| **1.05 bn t** of food was wasted in 2022 (19% of food available to consumers), of which retail accounts for **131 Mt**. Food loss and waste cause **8–10%** of global greenhouse-gas emissions. | UNEP (2024) | |
| The UAE imports **~85–90%** of its food. Fresh transit times rose **"by several days"**. Berries, leafy greens and stone fruit were most affected, and perishables were hit first. Unpredictability is a bigger issue than lead time itself. | Sohail (2026), *Gulf Business*, 1 Jun | Quotes from named UAE food-industry CEOs |
| The UAE imports **over 90%** of its food, and **~70%** of food imports transit Bab el-Mandeb. | Fathallah (2024), Atlantic Council | |
| Ramadan contributes **~19%** of annual FMCG sales across MENA. FMCG value in Ramadan 2025 was **+20.2%** against Ramadan 2024. | Communicate Online (2026), NielsenIQ data | |
| UAE FMCG volumes **peaked in March 2026**, when Ramadan coincided with conflict-driven **stockpiling**. | Rana (2026), Worldpanel by Numerator | A real-world example of the festival-plus-surprise spike the lead described |
| The UAE target is to **halve food loss and waste by 2030** (ne'ma). | Gulf News (n.d.) | ⚠ The news-reported estimate that ~AED 6 bn of food is wasted a year needs verifying before use. |
| Out-of-stocks and overstocks cost retailers **US$1.73 trillion** a year (~6.5% of sales). | IHL Group (2025) | ⚠ Vendor estimate; use with a caveat. |

**AI techniques that fit, and why**

| Technique | Why it fits this problem |
|---|---|
| **Demand unconstraining**: recovering latent demand from hourly stock status, similar stores and SKUs, and covariates | Removes the root bias that sales are not the same as demand |
| **Probabilistic forecasting**: gradient-boosted quantile models with festival, promotion and weather features, benchmarked against seasonal-naive and exponential smoothing | Orders need a range (P50/P90), not a single number. Tree models handle moving holidays and many drivers, and they train in minutes on a laptop. |
| **Spike detection and event-uplift estimation** | Detects unannounced surges early from intraday sales speed and stock status, and sizes festival lifts |
| **Shelf-life-aware replenishment optimisation**: newsvendor critical ratio plus a reorder-policy simulation with stock ageing (first in, first out, FIFO) | Answers "how much, and how early" with an explicit trade-off between waste and availability |
| **Monte Carlo scenario simulation** | Stress-tests ordering policies against festivals, spikes and supply shocks, compared with a baseline |
| **Multi-criteria sourcing**: AHP or entropy weights plus TOPSIS | Ranks three sourcing options: local vertical or controlled-environment farms, regional overland suppliers, and sea or air imports. The criteria are landed cost, freshness on arrival, lead-time reliability, chokepoint exposure and CO2e. The method is transparent enough for a board to audit. |

**Key questions answered**

| KQ1 | KQ2 | KQ3 | KQ4 | KQ5 |
|---|---|---|---|---|
| ● Spoilage (overstock), visible and hidden stockouts, festival seasonality | ● The data holds exactly the brief's examples (sales, promotions, weather, holidays) plus stock status | ● Hourly stock status drives intraday automated replenishment | ● Waste tonnes, CO2e and cost, compared with a baseline | ● Fresh sourcing under disruption |

**Fit with added requirements:** R1 ● · R2 ● · R3 ● · R4 ● · R5 ●.

**Data availability**

- **Real, recent: FreshRetailNet-50K** (Dingdong, 2025; licence CC BY 4.0). It has 50,000 store-product series from 898 stores in 18 Chinese cities, covering ~860 perishable SKUs. Fields include hourly sales and hourly stock status, discount, holiday and activity flags, and precipitation, temperature, humidity and wind. It covers March–June 2024 (90 days plus a 7-day evaluation window). Sales are scaled by an undisclosed coefficient, and there are no prices or costs.
- **Successor: FreshRetailNet-LT** (released Feb 2026; CC BY 4.0). It has over 20,000 series from 1,057 stores, with 576 perishable SKUs and the same fields. Its time span is not stated.
- **Hosting.** Both datasets are on Hugging Face. I found **no official Kaggle listing**, only a [Kaggle notebook that uses the data](https://www.kaggle.com/code/rajadurai23/freshretail-net50k).
- **Multi-year grocery data with promotions and holidays.** Corporación Favorita on Kaggle (Ecuador, 2013–2017).
- **Gap.** I found no public dataset that combines multi-year seasonality, Gulf festivals, a stock-in/stock-out ledger and supplier data. This points to a hybrid (section 6).

**Dashboard demonstrability: very high.** One control tower with shared scenario levers. Its signature moments are:

- revealing **true versus recorded demand**;
- the stock-in/stock-out flow;
- the festival calendar;
- the **trade-off curve between waste and availability**;
- supplier rankings that re-order live as the weights change.

**Boardroom angle**

- **B1 Business model shift.**
  - From "replenish what sold" to "replenish what customers wanted".
  - From cheapest landed cost to resilience-weighted sourcing (local farms plus diversified routes).
  - From daily batch ordering to intraday, exception-based automation.
  - Surplus goes to food rescue rather than disposal.
- **B2 Technology investment.** Stock-status capture, a forecasting and optimisation engine, and supplier scoring, phased with return-on-investment gates.
- **B3 Ecosystem integration.** Suppliers (shared forecasts, vendor-managed inventory), local farms, cold-chain logistics partners, weather and calendar feeds, and food-rescue partners in the national ne'ma programme.
- **B4 Operational risk.** Chokepoint disruption, cold-chain integrity, model drift at festivals, stock-record quality, and over-automation (kept in check with a human in the loop).

**Weaknesses.** The real data is Chinese, scaled and only 90 days long, so the UAE layer must be synthetic and labelled. The scope is rich and needs discipline.

**Score: 4.85 / 5**

---

### Candidate B: Chokepoint-proof replenishment for a UAE food importer (lead-time disruption)

**The problem.** An importer-distributor sets safety stock and order timing on "normal" lead times. When a chokepoint closes, lead times jump and vary. The result is stockouts, emergency air freight, or cash tied up in panic stock.

**Evidence**

- Average daily commercial transits through Hormuz fell **~95%** in March–May 2026 (*Sustainability*, 2026, 18(18), 9534). ⚠ I read this only through secondary coverage, so it needs verifying against the paper.
- **~70%** of UAE food imports transit Bab el-Mandeb (Fathallah, 2024).
- Rerouting via the Red Sea, the Saudi land corridors and Fujairah cannot fully replace Jebel Ali, and freight and war-risk premiums rose (Sohail, 2026).

**AI techniques that fit, and why**

| Technique | Why it fits |
|---|---|
| Lead-time and ETA prediction | The uncertain input here is supply, not demand |
| Probabilistic safety stock with disruption Monte Carlo | Sizes buffers for fat-tailed delays |
| Dual-sourcing optimisation | Balances cost against resilience |
| AHP-TOPSIS supplier and route selection | Shows trade-offs a board can audit |

**Key questions:** KQ1 ◐ (stockouts, but little seasonality) · KQ2 ◐ (strong external risk data, weak demand data) · KQ3 ● (in-transit visibility) · KQ4 ◐ (transport-mode emissions, expediting cost) · KQ5 ●.

**Added requirements:** R1 ● · R2 ◐ · R3 ○ · R4 ● (supply side) · R5 ●.

**Data availability**

- IMF PortWatch: real daily transit calls through chokepoints, updated weekly.
- USAID Supply Chain Shipment Pricing Data: real, ~10.3k shipments of health commodities from 2006–2015, with scheduled and actual delivery dates.
- There is no matching demand data, so demand would be mostly synthetic.

**Dashboard demonstrability: good.** A route map, disruption toggles and lead-time distributions.

**Boardroom angle**

- **B1:** from just-in-time to "just-in-case where it pays".
- **B2:** a visibility and ETA platform.
- **B3:** forwarders, ports and alternative corridors.
- **B4:** the strongest risk story of all four candidates.

**Weaknesses.** It is thin on the demand side (festivals and spikes, R2–R3), and it drifts toward logistics rather than inventory.

**Score: 3.55 / 5.** Its disruption scenarios are folded into A.

---

### Candidate C: Fashion, buying new seasonal products with no sales history under the EU ban on destroying unsold stock

**The problem.** Buyers commit months ahead to styles with no sales history, and errors become markdowns, stockouts or waste. Since **19 July 2026**, large companies may not destroy unsold apparel, clothing accessories or footwear in the EU, and medium-sized companies follow from 2030. Overstock is now a compliance problem as well as a margin problem.

**Evidence**

- The destruction ban comes from the EU Ecodesign for Sustainable Products Regulation, (EU) 2024/1781 (European Circular Economy Stakeholder Platform, n.d.).
- The equivalent of one garbage truck of textiles is landfilled or burned every second (Ellen MacArthur Foundation, 2017). ⚠ This figure comes from press coverage; the primary report needs checking.

**AI techniques that fit, and why**

| Technique | Why it fits |
|---|---|
| Look-alike forecasting from product attributes and embeddings | With no sales history, it borrows from similar past products |
| Two-stage newsvendor | Matches the one initial buy plus one in-season re-order |
| Markdown optimisation | Clears leftover stock |
| Near-shore vs far-shore multi-criteria choice | Weighs cost, speed and compliance |

**Key questions:** KQ1 ● · KQ2 ◐ (no promotion or weather data) · KQ3 ◐ (in-season sell-through only) · KQ4 ● · KQ5 ●.

**Added requirements:** R1 ◐ (no stock data) · R2 ● · R3 ● (two years of seasonality) · R4 ◐ (viral items) · R5 ●.

**Data availability.** H&M Personalized Fashion Recommendations (Kaggle, 2022): ~31.8M transactions and ~105k articles with attributes, from Sep 2018 to Sep 2020. There are no stock, promotion or weather fields.

**Dashboard demonstrability: good.** A look-alike finder, a buy-quantity optimiser and sell-through curves.

**Boardroom angle**

- **B1:** from forecast-and-push to test-and-react.
- **B2:** AI built on product attributes.
- **B3:** near-shore suppliers and resale partners.
- **B4:** regulatory (ESPR) and fashion risk.

**Weaknesses.** The main regulatory driver is EU-centric and less local to a Dubai board, and there is no inventory data.

**Score: 3.65 / 5**

---

### Candidate D: Phantom inventory, where the system says "in stock" but the shelf is empty

**The problem.** Inventory record errors silently freeze automated replenishment. The system believes stock exists, so it never reorders, and the shelf stays empty until someone notices.

**Evidence**

- 65% of ~370,000 inventory records were inaccurate across 37 stores of one retailer (DeHoratius and Raman, 2008, *Management Science*).
- Bayesian detection methods have been demonstrated, but only on proprietary data (MIT thesis, DSpace 1721.1/122257).

**AI techniques that fit, and why**

| Technique | Why it fits |
|---|---|
| Bayesian or negative-binomial "implausible zero-sales" detection | Flags SKUs whose lack of sales is statistically unlikely |
| Anomaly detection across stores and SKUs | Finds outlier patterns at scale |
| Audit prioritisation | Audit labour is limited, so the riskiest SKUs go first |
| Computer vision and RFID | Give direct visibility of the shelf |

**Key questions:** KQ1 ◐ · KQ2 ◐ · KQ3 ● (record errors are the classic failure mode of automated replenishment) · KQ4 ○ · KQ5 ○.

**Added requirements:** R1 ● · R2 ◐ · R3 ◐ · R4 ◐ · R5 ●.

**Data availability.** I found no public dataset that pairs system records with physical counts; the published methods used proprietary data. This candidate would be almost fully synthetic.

**Dashboard demonstrability: strong.** An audit queue and a store heat map.

**Boardroom angle**

- **B1:** from trusting the system to verifying it.
- **B2:** RFID and computer vision.
- **B3:** store operations and vendors.
- **B4:** silent stockouts.

**Weaknesses.** Procurement multi-criteria decision-making and sustainability fit poorly, and the data is synthetic.

**Score: 2.95 / 5.** Folded into A as an optional "record error" lever.

---

## 4. Scores and ranking

| Criterion (weight) | A: Fresh hidden stockouts | C: Fashion cold-start | B: Chokepoint importer | D: Phantom inventory |
|---|---|---|---|---|
| Evidence (15%) | 5 | 4 | 5 | 4 |
| Key questions (20%) | 5 | 4 | 3 | 2 |
| Fit with R1–R5 (20%) | 5 | 3 | 3 | 3 |
| Data (15%) | 4 | 3 | 2 | 1 |
| Dashboard (10%) | 5 | 4 | 4 | 4 |
| Boardroom (10%) | 5 | 4 | 5 | 3 |
| Originality (10%) | 5 | 4 | 4 | 5 |
| **Weighted total** | **4.85** | **3.65** | **3.55** | **2.95** |
| **Rank** | **1** | 2 | 3 | 4 |

---

## 5. Recommendation: Candidate A

**Why A**

1. It is the only candidate that is strong on **all five key questions** and on **all of R1–R5**.
2. Its evidence is **recent, quantified and local**:
   - a 2025 benchmark that measures the hidden-stockout bias;
   - UNEP waste data;
   - 2026 UAE reporting on Ramadan peaks, stockpiling and Hormuz-driven lead times.
3. It is **not** the overused "forecast store sales" project, and the board message is sharper: *"our sales data under-reports demand exactly when it matters most, and in fresh food every wrong guess either rots or walks out of the door."*
4. Perishability makes the lead's question, *"how early should we stock up?"*, genuinely interesting. For fresh items, shelf life caps the answer. The system must choose between stocking early, using a faster or closer supplier, or accepting some risk, and put a price on each option.
5. Candidates B and D are **absorbed as scenario levers** (supply shock and record error), which matches the one-dashboard request.

**Draft problem statement (for approval)**

> A UAE fresh-grocery and quick-commerce operator (a fictional composite used for the case) is losing money at both ends of the shelf: fresh food spoils while customers meet empty shelves. Its replenishment system learns from sales, but sales stop when stock runs out. True demand at the busiest moments (Ramadan, Eid, weekends, sudden surges) is therefore never recorded, and the system keeps under-ordering. Since the 2026 Hormuz shipping disruption, fresh lead times are also longer and less predictable. We propose an AI replenishment engine shown in one scenario-driven control tower. It recovers hidden demand and forecasts it as a range. It decides how much to order and how early. It ranks suppliers on cost, freshness, reliability, disruption risk and carbon.

**How the added scenarios fit.** These are capabilities the prototype must show; the design itself comes in Phase 3.

| Scenario | What the prototype will answer |
|---|---|
| Stock in / stock out (R1) | Receipts by supplier, sales, waste, on-hand stock and stockout hours per SKU, store and day, compared with a baseline policy |
| Raise or lower daily orders (R2) | Demand and order-volume sliders whose effect flows through the forecast, orders, stock, waste and cost |
| Seasonality and festivals (R3) | Ramadan, Eid al-Fitr, Eid al-Adha, UAE National Day, New Year, the summer season and weekly cycles, each switchable |
| Sudden spike, e.g. 200 → 500 (R4) | **Known in advance** (festival, promotion or event): the latest safe order date (spike date minus lead time minus handling time), capped by shelf life, and the cost of building stock early compared with using a faster supplier. **Unannounced:** how quickly detection fires, the expedite and re-allocation options, lost sales against waste for each response, and how much warning would have covered the spike. |
| Supply shock (from B) | Lead-time stretch and variability (a Hormuz-type scenario), a supplier outage, and live re-ranking of suppliers |
| Record errors (from D) | An optional "phantom stock" lever that shows why real-time visibility matters |
| Single control surface (R5) | One shared scenario state across all views |

---

## 6. Data direction (preview; decided in Phase 2)

- Phase 2 will search properly for a real dataset that meets R1–R6. Phase 1 research found none that covers everything at once.
- **The likely recommendation is a hybrid.**
  - **Real data for calibration and validation.** FreshRetailNet-50K/LT for hourly demand shapes, stockout behaviour, and promotion and weather effects. A multi-year dataset (for example Favorita, or the weekly 2021–2024 data from the VN2 inventory-planning challenge) for long-run seasonality.
  - **A near-real synthetic UAE dataset** generated from those patterns. It would cover 2–3 years of daily data (hourly for a recent window), with a UAE festival calendar, spike events, suppliers and lead times, and a full stock-in/stock-out ledger.
- **Why synthetic ground truth helps.** Because we generate the true demand, we can prove how much demand the stockouts hid and how well the AI recovers it. No real dataset can show that.
- **Labelling.** Every synthetic table, chart and report figure is marked "Synthetic, calibrated to [source]".
- **Kaggle.** FreshRetailNet's official home is Hugging Face. Given the lead's message, Kaggle is treated as preferred, not mandatory, unless told otherwise.

---

## 7. Flags and assumptions

1. KQ2 is duplicated in the brief. We answer it once and flag the duplication in the report.
2. One anchor problem with many scenario levers reconciles the brief with R5.
3. The client is a **fictional composite** UAE operator. No real company facts or figures will be invented.
4. "Real-time" means a **simulated replay feed**, labelled as simulated.
5. NotebookLM will ingest the **compiled PDF** from Overleaf.
6. Items marked ⚠ come from news, vendor or secondary sources. Before any of them enters the report, it is either verified against a primary source or carried with an explicit caveat.
7. The Hormuz disruption is treated **neutrally**, as a supply-risk scenario. The project takes no political position.

---

## 8. Sources (Harvard style; all accessed 13 November 2026)

- Communicate Online (2026) 'Ramadan fuels double-digit FMCG growth, boosts tech sales across MENA', *Communicate*, 23 February [NielsenIQ data]. Available at: https://communicateonline.me/news/ramadan-fuels-double-digit-fmcg-growth-boosts-tech-sales-across-mena/
- Corporación Favorita (2017) *Corporación Favorita Grocery Sales Forecasting* [Dataset]. Kaggle. Available at: https://www.kaggle.com/competitions/favorita-grocery-sales-forecasting
- DeHoratius, N. and Raman, A. (2008) 'Inventory record inaccuracy: an empirical analysis', *Management Science*, 54(4), pp. 627–641. doi: 10.1287/mnsc.1070.0789.
- Dingdong-Inc (2025) *FreshRetailNet-50K* [Dataset]. Hugging Face. Available at: https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K
- Dingdong-Inc (2026) *FreshRetailNet-LT* [Dataset]. Hugging Face. Available at: https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-LT
- Ellen MacArthur Foundation (2017) *A New Textiles Economy: Redesigning Fashion's Future*. ⚠ The figure is from press coverage: https://www.circularonline.co.uk/news/one-truck-textiles-landfilled-burned-every-second-says-new-macarthur-report/ (the primary report still needs checking).
- European Circular Economy Stakeholder Platform (n.d.) 'New EU rules to stop the destruction of unsold clothes and shoes'. Available at: https://circulareconomy.europa.eu/platform/en/news-and-events/all-news/new-eu-rules-stop-destruction-unsold-clothes-and-shoes
- Fathallah, H. (2024) 'Ensuring the UAE's food security in an unstable region', *MENASource*, Atlantic Council, 22 August. Available at: https://www.atlanticcouncil.org/blogs/menasource/uae-food-security
- Gulf News (n.d.) 'UAE unveils roadmap to target of halving food waste by 2030'. Available at: https://gulfnews.com/uae/environment/uae-unveils-roadmap-to-target-of-halving-food-waste-by-2030-1.99492918 ⚠ Publication date to confirm.
- H&M Group (2022) *H&M Personalized Fashion Recommendations* [Dataset]. Kaggle. Available at: https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations
- IHL Group (2025) 'Retail inventory crisis persists despite $172 billion in improvements', September. Available at: https://www.ihlservices.com/news/analyst-corner/2025/09/retail-inventory-crisis-persists-despite-172-billion-in-improvements ⚠ Vendor estimate.
- IMF PortWatch (n.d.) *Chokepoint transit data*. International Monetary Fund. Available at: https://portwatch.imf.org
- Khaleej Times (n.d.) 'UAE: Dh6 billion worth of food wasted annually, says minister'. Available at: https://khaleejtimes.com/uae/uae-dh6-billion-worth-of-food-wasted-annually-says-minister ⚠ Not yet read directly; verify before use.
- MIT (n.d.) 'Detection of phantom inventories at retail stores using a Bayesian approach' [Thesis]. DSpace@MIT. Available at: https://dspace.mit.edu/handle/1721.1/122257 ⚠ Author and year to confirm.
- Rana, P. (2026) 'UAE FMCG grows during Ramadan amid conflict pressures', Worldpanel by Numerator, 19 June. Available at: https://worldpanelbynumerator.com/insights/uae-fmcg-demand-q1-2026-ramadan-consumption-trends
- Sohail, N. (2026) 'Higher costs, tighter margins: how Hormuz disruptions are testing UAE food supplies', *Gulf Business*, 1 June. Available at: https://gulfbusiness.com/en/2026/logistics/higher-costs-tighter-margins-how-hormuz-disruptions-are-testing-uae-food-supplies/
- *Sustainability* (2026) 'The 2026 Strait of Hormuz shipping disruption: empirical assessment of maritime transit collapse, food price dynamics, and multimodal logistics resilience', 18(18), 9534. Available at: https://www.mdpi.com/2071-1050/18/18/9534 ⚠ Read only through secondary coverage; authors and figures to verify.
- UNEP (2024) *Food Waste Index Report 2024. Think Eat Save: Tracking Progress to Halve Global Food Waste*. Nairobi: United Nations Environment Programme. Key messages available at: https://wedocs.unep.org/bitstream/handle/20.500.11822/45275/Food-Waste-Index-2024-key-messages.pdf
- USAID (n.d.) *Supply Chain Shipment Pricing Data* [Dataset]. Available at: https://data.amerigeoss.org/dataset/supply-chain-shipment-pricing-data
- VN2 inventory planning challenge write-up (2026) arXiv 2601.18919. Available at: https://arxiv.org/abs/2601.18919 ⚠ Authors and full title to confirm.
- Wang, Y., Gu, J., Long, L., Li, X., Shen, L., Fu, Z., Zhou, X. and Jiang, X. (2025) 'FreshRetailNet-50K: a stockout-annotated censored demand dataset for latent demand recovery and forecasting in fresh retail', *arXiv* 2505.16319 [v5, 18 June 2026]. Available at: https://arxiv.org/abs/2505.16319

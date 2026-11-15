# CR-004: dashboard changes from the team walkthrough (15 Nov 2026)

| Field | Value |
|---|---|
| Raised by | Anurag (changes agreed in the team's walkthrough of the live dashboard) |
| Date | 2026-11-15 |
| Status | Proposed |
| Affects | the plan (`implementation-plan.md` §6.1 page specs, page 2 and page 7; §11 traceability row S1). No data contract, token or dependency changes. |
| Files | `web/src/app/demand/DemandLab.tsx`, `web/src/app/roadmap/Roadmap.tsx`, plus the plain-language and units changes listed below |
| Tasks affected | P6-02 (Demand Lab), P9-02 (Roadmap) |

## Problem

The team walked through the live dashboard as a first-time stakeholder would. Three findings conflict with the page specs in the frozen plan:

1. **Demand Lab › Real-data tab.** The plan lists a "Real-data tab" (FreshRetailNet stockout curve, censoring evidence, masking test). The team found it hard for a non-specialist to read, and not needed on the dashboard. The plan's traceability table maps **S1** ("identify a real-world supply chain challenge") to "Overview hero; Demand Lab Real-data tab".
2. **Demand Lab › the "train on sales vs recovered" toggle.** On one chart, the recovered demand and the AI forecast were both violet, and the recorded sales and the current method's forecast were both orange. The lines blurred together.
3. **Roadmap › tab order.** The plan puts the roadmap content first and **Methods & Data** as a second tab. The team wants the methods first, and the risk register at the top of the roadmap.

## Proposed change

1. **Remove the Real-data tab** from Demand Lab. The real-data evidence stays on the dashboard, in plain words, on **Roadmap › Methods & Data**. The model cards keep the masking test on FreshRetailNet-50K (recovery off by about 30% on a typical day, against a 25% target) and the forecast-bias result (from 18.9% too low to 0.4% low). The artefact `realdata.json` and its contract are unchanged and still validated.
   - **S1 traceability becomes:** Overview hero; Roadmap › Methods & Data (real-data evidence in the model cards).
2. **Split the Demand Lab chart in two** instead of using the toggle:
   - "What customers wanted vs what the till recorded": true demand, recorded sales, recovered demand.
   - "How close each forecast came to true demand": true demand, the AI forecast with its likely range, and the current method's forecast.

   Each colour now means one thing per chart, within the design system's entity colours (§4.2). The bias reveal is kept: the readout under the second chart states both forecasts' average error in words. No design-system change is needed.
3. **Roadmap:** Methods & Data becomes the first tab and opens by default. In the Roadmap tab, the risk register comes first, then the business-model shift, the phases and the partners. The content is unchanged.

## Also changed (no plan conflict; listed for the record)

- **Units, one style everywhere:** weights always in kilograms ("128,450 kg"); money in full below one million ("AED 7,768") and in millions above ("AED 2.14 million"); dates day-first ("15/11/2026").
- **Plain language:** the policy codes P0–P3 appear on screen as "Current method", "AI daily ordering", "AI + midday top-up" and "AI + top-up + best supplier". The codes stay in the data files and the report. The mapping is in `web/src/lib/labels.ts`.
  - "P10/P50/P90" become "typical result" and "likely range (8 in 10 runs)".
  - τ becomes "stock-level setting".
  - Every chart has a "how to read" note and axis titles with units.
- **Chart filters:** each chart with several lines can show one line (click a name), several (click more) or all ("Show all"). Colours never change (design system §4.2).
- **Headers:** "fictional UAE dark-store operator" is removed from the Overview eyebrow, and "Runs in your browser" from the Scenario Studio eyebrow. The top bar still says "Fictional UAE operator".
- **Sourcing:** the two control groups ("How to weigh what matters" and "Supply conditions") are separated and numbered.
- **Unchanged:** the preset names (design system §6 lists "200→500 Spike"), and all data contracts, tokens and dependencies.

## Impact

- Code: two pages restructured, and text throughout. Tests were updated, and new ones cover the formats, the filter logic and the plain labels.
- Report: Phase 6 can cite the Methods & Data tab for the real-data evidence (S1).

## Alternatives considered

- **Keep the Real-data tab but simplify it.** The team preferred removing it; the evidence stays on Methods & Data.
- **Give the forecasts new colours** (needs a design-system change). Rejected in favour of the split, which needs no frozen-file change.

## Lead decision

<Pending>

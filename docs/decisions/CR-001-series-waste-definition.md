# CR-001: `series.waste` means expiry plus quality culls on receipt

| Field | Value |
|---|---|
| Raised by | Anurag (continuing Kartik's Part 2 note of 2026-11-14) |
| Date | 2026-11-14 |
| Status | Proposed |
| Affects | data contract (documentation comment only) |
| Files | `web/src/lib/contracts/series.ts` |
| Tasks affected | P2-02 (producer of the definition), P4-06 (series exporter), P6-03 and P7-03 (pages that label waste) |

## Problem

The comment on `SeriesRow.waste` says "Stock-out by expiry (sales units)". The Part 2 engine (`pipeline/freshpipe/simulate.py`) counts **two** kinds of waste:
- **handling loss:** units culled for quality when a delivery is received;
- **expiry:** units thrown away at the end of their shelf life.

The fidelity bands compare this total with the real Kaggle loss rates, which also include both kinds. If the exporter followed the comment and wrote expiry only, vegetable waste would drop from about 12% to about 0.02% of receipts, and every waste KPI on the dashboard would be wrong.

## Proposed change

The comment changes; the schema does not.

```diff
-    /** Stock-out by expiry (sales units). */
+    /** Stock-out by waste: quality culls on receipt plus expiry (sales units). */
     waste: NonNegative,
```

## Impact

- **No schema change.** The JSON Schemas carry no descriptions, so `CONTRACT_VERSION` stays at 1.0.0 and the fixtures stay valid.
- **The P4-06 exporter** writes `waste = handling_loss + expired` from the P0 daily table.
- **Pages** label the series "Waste (culls + expiry)".

## Alternatives considered

- **Add separate `handlingLoss` and `expired` fields.** This needs a schema change and new fixtures, for a split no page uses. It can be raised later if the Impact page wants the split.
- **Model expiry only.** Rejected: baseline spoilage would then fail the real loss-rate bands (D-23).

## Lead decision

<Pending>

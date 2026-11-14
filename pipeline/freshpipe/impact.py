"""Annualised cost and sustainability impact of the AI ladder vs the baseline (P4-05, plan §4.6) → impact.json.

Labelled ILLUSTRATIVE and CALIBRATED SYNTHETIC: the median Monte Carlo result over the Jan-Oct 2026 test
window, scaled to 12 months (× 365 ÷ 304 days), for a fictional 8-store operator.

- **Waste CO2e:** wasted kg × the category food factor (Poore and Nemecek, 2018, via OWID).
- **Transport CO2e:** delivered kg × route distance × the DESNZ 2025 mode factor.
- **Food rescue:** a share of the stock that would expire (not quality culls) is diverted to food-rescue
  partners before its last day (ASSUMPTION; the UAE's ne'ma food-loss programme is the context).
"""

from __future__ import annotations

import numpy as np

from .optimise import DISPOSAL_AED_PER_KG, GOODWILL_SHARE_OF_PRICE, HOLDING_SHARE_PER_DAY, TOPUP_PREMIUM

TEST_DAYS = 304
ANNUAL = 365.0 / TEST_DAYS
FOOD_RESCUE_SHARE_OF_EXPIRY = 0.5     # ASSUMPTION: half of the stock about to expire is collected in time
AI_POLICY = "P3"


def _median(runs: list[dict], key: str, component: bool = False) -> float:
    values = [r["_components"][key] if component else r[key] for r in runs]
    return float(np.median(values))


def impact_body(mc: dict[str, dict[str, list[dict]]], ai_policy: str = AI_POLICY) -> dict:
    """The impact.json body (contract: results.ts, ImpactFile)."""
    base, ai = mc["test-2026"]["P0"], mc["test-2026"][ai_policy]
    comp = ("lost_margin_goodwill", "waste", "holding", "expedite")
    b = {c: _median(base, c, True) * ANNUAL for c in comp}
    a = {c: _median(ai, c, True) * ANNUAL for c in comp}
    labels = {"lost_margin_goodwill": "Fewer lost sales (margin + goodwill)", "waste": "Waste cost",
              "holding": "Holding cost", "expedite": "Expediting and sourcing premium"}
    waterfall = [{"id": "baseline-cost", "label": "Baseline (P0) total cost", "valueAED": round(sum(b.values()), 0),
                  "kind": "baseline"}]
    for c in comp:
        waterfall.append({"id": c.replace("_", "-"), "label": labels[c], "valueAED": round(a[c] - b[c], 0), "kind": "delta"})
    waterfall.append({"id": "ai-cost", "label": f"AI ({ai_policy}) total cost", "valueAED": round(sum(a.values()), 0),
                      "kind": "total"})
    rescue = FOOD_RESCUE_SHARE_OF_EXPIRY * _median(ai, "expired_kg", True) * ANNUAL
    co2 = {pid: {"food": _median(mc["test-2026"][pid], "co2e_food", True) * ANNUAL,
                 "transport": _median(mc["test-2026"][pid], "co2e_transport", True) * ANNUAL} for pid in ("P0", ai_policy)}
    assumptions = [
        {"id": "goodwill", "label": "Goodwill cost of a lost sale", "value": GOODWILL_SHARE_OF_PRICE * 100, "unit": "% of price",
         "sourceId": None, "note": "Future custom lost when a shelf is empty (assumption)."},
        {"id": "disposal", "label": "Disposal of spoiled food", "value": DISPOSAL_AED_PER_KG, "unit": "AED/kg",
         "sourceId": None, "note": "Assumption."},
        {"id": "holding", "label": "Holding cost", "value": HOLDING_SHARE_PER_DAY * 100, "unit": "% of unit cost per day",
         "sourceId": None, "note": "Refrigeration and capital (assumption)."},
        {"id": "topup-premium", "label": "Same-day top-up premium", "value": TOPUP_PREMIUM * 100, "unit": "% of unit cost",
         "sourceId": None, "note": "UAE wholesale market, delivered 16:00 (assumption)."},
        {"id": "food-rescue", "label": "Expiring stock diverted to food rescue", "value": FOOD_RESCUE_SHARE_OF_EXPIRY * 100,
         "unit": "% of expiring kg", "sourceId": None, "note": "Food-rescue partners (assumption; ne'ma programme context)."},
        {"id": "food-co2e", "label": "Food emission factors", "value": 0.0, "unit": "kg CO2e/kg (by category)",
         "sourceId": "poore-nemecek2018", "note": "Poore and Nemecek (2018), 2010 global averages via OWID."},
        {"id": "transport-co2e", "label": "Transport emission factors", "value": 0.0, "unit": "kg CO2e per tonne.km (by mode)",
         "sourceId": "desnz2025-ghg-factors", "note": "DESNZ 2025 freight factors x route distance."},
        {"id": "annualisation", "label": "Annualisation factor", "value": round(ANNUAL, 4), "unit": "x",
         "sourceId": None, "note": "Jan-Oct 2026 (304 days) scaled to 365 days."},
    ]
    return {
        "period": {"start": "2026-01-01", "end": "2026-10-31"},
        "annualisation": (f"Median of the Monte Carlo runs over the Jan-Oct 2026 test window x {ANNUAL:.3f} (to 12 "
                          "months). Illustrative and synthetic: a fictional 8-store operator."),
        "waterfall": waterfall,
        "waste": {"baselineKg": round(_median(base, "wasteKg") * ANNUAL, 0),
                  "aiKg": round(_median(ai, "wasteKg") * ANNUAL, 0), "foodRescueKg": round(rescue, 0)},
        "co2e": {"baselineKg": round(sum(co2["P0"].values()), 0), "aiKg": round(sum(co2[ai_policy].values()), 0),
                 "byComponent": [{"id": "food-waste", "label": "Wasted food", "baselineKg": round(co2["P0"]["food"], 0),
                                  "aiKg": round(co2[ai_policy]["food"], 0)},
                                 {"id": "transport", "label": "Transport", "baselineKg": round(co2["P0"]["transport"], 0),
                                  "aiKg": round(co2[ai_policy]["transport"], 0)}]},
        "assumptions": assumptions,
    }

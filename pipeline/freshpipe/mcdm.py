"""Multi-criteria supplier ranking: AHP, entropy weights, TOPSIS, sensitivity and allocation (P4-03, plan §5).

- **AHP** (Saaty, 1980): weights = principal eigenvector of the pairwise matrix; consistency ratio
  CR = CI / RI with CI = (λmax − n) / (n − 1) and Saaty's random index RI. The default matrix is the
  documented "board preference" and must have CR < 0.10.
- **Entropy weights:** a data-driven alternative. Criteria whose values differ more across suppliers get
  more weight.
- **TOPSIS** (Hwang and Yoon, 1981): vector normalisation, weighting, then closeness = d⁻ / (d⁺ + d⁻) to the
  ideal and anti-ideal suppliers.
- **Sensitivity:** each weight ±20% (the others rescaled to sum to 1), recording rank changes.
- **Allocation:** a linear programme (SciPy `linprog`) that meets demand at the best score within supplier
  capacity, plus the greedy rule the browser uses. They agree whenever capacities are single-tier (tested).

The supplier metrics are DERIVED from the same fictional supplier terms the simulation uses
(`world.SUPPLY_TERMS`), from real route distances, and from DESNZ 2025 transport factors, so the ranking
and the backtests describe the same suppliers.
"""

from __future__ import annotations

import math

import numpy as np

from .geography import SUPPLIER_ROUTES, route_distance_km
from .reference import transport_factor
from .world import CATEGORIES, SKUS, SupplyTerms, shelf_life_days, suppliers

#: Saaty random index for n = 1..10 (also in the web contract, mcdm.ts).
SAATY_RI = (0.0, 0.0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49)

CRITERIA = (
    ("landed-cost", "Landed cost", "cost", "AED/kg", "Purchase price plus freight and duties per kg delivered."),
    ("lead-time", "Lead time", "cost", "days", "Mean days from order to arrival, including late deliveries."),
    ("reliability", "Lead-time reliability", "benefit", "% on time", "Share of orders delivered in full on the due day."),
    ("freshness", "Freshness on arrival", "benefit", "% shelf life left",
     "Share of total shelf life still left when the stock reaches the store."),
    ("quality-rejects", "Quality rejects", "cost", "%", "Share of received units rejected for quality."),
    ("disruption-exposure", "Disruption exposure", "cost", "score 0-1",
     "Exposure of the route to chokepoints such as Hormuz and Bab el-Mandeb."),
    ("carbon", "Carbon", "cost", "kg CO2e/kg", "Transport emissions per kg delivered (DESNZ 2025 x route distance)."),
)
CRITERION_IDS = tuple(c[0] for c in CRITERIA)
BENEFIT = np.array([c[2] == "benefit" for c in CRITERIA])

#: Board preference on Saaty's scale (row criterion vs column criterion), in CRITERIA order. ASSUMPTION,
#: documented: freshness and reliability first, then cost and disruption exposure, then lead time,
#: then quality rejects and carbon. Built from importance scores so it is nearly consistent.
IMPORTANCE = (4, 3, 5, 5, 2, 4, 2)

# ASSUMPTIONS (docs/06-decisions.md): landed cost relative to the cheapest regional source; transit days
# before the supplier's UAE handover; daily capacity; chokepoint exposure weights.
LANDED_COST_FACTOR = {"sup-local-farm": 1.15, "sup-local-bakery": 1.00, "sup-gcc-truck": 1.00, "sup-gcc-ksa": 0.95,
                      "sup-sea-import": 0.85, "sup-sea-khorfakkan": 0.90, "sup-sea-europe": 0.90,
                      "sup-air-import": 1.40, "sup-air-europe": 1.45}
REFERENCE_COST_AED_PER_KG = 6.0
TRANSIT_DAYS = {"local_truck": 0.2, "truck": 1.5, "sea": None, "air": 1.5}   # sea: distance-based
SEA_KM_PER_DAY = 650.0
SEA_PORT_DAYS = 2.0
CAPACITY_KG_PER_DAY = {"local": 1500, "gcc_overland": 4000, "sea_import": 8000, "air_import": 1200}
CHOKEPOINT_WEIGHT = {"hormuz": 0.6, "bab-el-mandeb": 0.25, "suez": 0.15}
AIR_EXPOSURE = 0.1          # airspace closures; no sea chokepoint

#: Archetype names in mcdm.json (contract enum). The Part 2 archetype "local" (farm and bakery) maps to
#: the contract's "local_farm" until CR-002 renames it.
CONTRACT_ARCHETYPE = {"local": "local_farm", "gcc_overland": "gcc_overland", "sea_import": "sea_import",
                      "air_import": "air_import"}


# --- AHP ------------------------------------------------------------------------------------------------------

def saaty_from_importance(importance: tuple[int, ...]) -> np.ndarray:
    """Pairwise matrix from importance scores: a difference of d points -> 1 + 2d (3 = moderate, 5 = strong)."""
    v = np.asarray(importance, dtype=float)
    diff = v[:, None] - v[None, :]
    return np.where(diff >= 0, 1.0 + 2.0 * diff, 1.0 / (1.0 - 2.0 * diff))


def ahp(matrix: np.ndarray) -> dict[str, object]:
    """Principal-eigenvector weights and Saaty's consistency check."""
    a = np.asarray(matrix, dtype=float)
    n = a.shape[0]
    if not np.allclose(a * a.T, 1.0):
        raise ValueError("AHP matrix must be reciprocal")
    values, vectors = np.linalg.eig(a)
    k = int(np.argmax(values.real))
    w = np.abs(vectors[:, k].real)
    w /= w.sum()
    lam = float(values[k].real)
    ci = (lam - n) / (n - 1) if n > 2 else 0.0
    ri = SAATY_RI[n - 1]
    # The matrix keeps 12 decimals: the web contract checks a_ij × a_ji = 1 to within 1e-6 (1/3 → 0.333333 fails).
    return {"matrix": a.round(12).tolist(), "weights": w.round(6).tolist(), "lambdaMax": round(lam, 6),
            "ci": round(ci, 6), "cr": round(ci / ri, 6) if ri else 0.0, "ri": ri}


# --- Entropy and TOPSIS ------------------------------------------------------------------------------------------

def entropy_weights(x: np.ndarray) -> np.ndarray:
    """Shannon-entropy weights of a (suppliers × criteria) matrix of non-negative values."""
    x = np.asarray(x, dtype=float)
    p = x / np.where(x.sum(axis=0) > 0, x.sum(axis=0), 1.0)
    plogp = np.where(p > 0, p * np.log(np.where(p > 0, p, 1.0)), 0.0)
    e = -plogp.sum(axis=0) / math.log(x.shape[0])
    d = 1.0 - e
    return d / d.sum()


def topsis(x: np.ndarray, weights: np.ndarray, benefit: np.ndarray) -> np.ndarray:
    """Closeness to the ideal (0-1, higher is better) for each row of a (suppliers × criteria) matrix."""
    x = np.asarray(x, dtype=float)
    norm = np.sqrt((x ** 2).sum(axis=0))
    v = x / np.where(norm > 0, norm, 1.0) * np.asarray(weights, dtype=float)
    best = np.where(benefit, v.max(axis=0), v.min(axis=0))
    worst = np.where(benefit, v.min(axis=0), v.max(axis=0))
    d_plus = np.sqrt(((v - best) ** 2).sum(axis=1))
    d_minus = np.sqrt(((v - worst) ** 2).sum(axis=1))
    total = d_plus + d_minus
    return np.where(total > 0, d_minus / np.where(total > 0, total, 1.0), 0.5)


def ranks(scores: np.ndarray) -> np.ndarray:
    """1 = best."""
    order = np.argsort(-scores, kind="stable")
    out = np.empty(len(scores), dtype=int)
    out[order] = np.arange(1, len(scores) + 1)
    return out


def sensitivity(x: np.ndarray, weights: np.ndarray, benefit: np.ndarray, step: float = 0.20) -> list[dict]:
    """Move each weight by ±step (relative), rescale the rest, and record which ranks change."""
    base = ranks(topsis(x, weights, benefit))
    out = []
    for j in range(len(weights)):
        for sign in (-1, 1):
            w = np.asarray(weights, dtype=float).copy()
            w[j] *= 1 + sign * step
            w /= w.sum()
            r = ranks(topsis(x, w, benefit))
            out.append({"criterion": CRITERION_IDS[j] if len(weights) == len(CRITERIA) else j, "change": sign * step,
                        "topUnchanged": bool(np.argmin(r) == np.argmin(base)), "ranks": r.tolist()})
    return out


# --- Allocation ----------------------------------------------------------------------------------------------------

def allocate_lp(demand: float, capacity: np.ndarray, score: np.ndarray) -> np.ndarray:
    """Minimise Σ (1 − score) × kg subject to Σ kg = demand and kg ≤ capacity (SciPy linprog)."""
    from scipy.optimize import linprog

    cap = np.asarray(capacity, dtype=float)
    if demand > cap.sum() + 1e-9:
        raise ValueError("demand exceeds total capacity")
    res = linprog(1.0 - np.asarray(score, dtype=float), A_eq=np.ones((1, cap.size)), b_eq=[demand],
                  bounds=list(zip(np.zeros(cap.size), cap)), method="highs")
    if not res.success:
        raise ValueError(res.message)
    return res.x


def allocate_greedy(demand: float, capacity: np.ndarray, score: np.ndarray) -> np.ndarray:
    """Fill suppliers in order of score up to capacity (the browser's rule)."""
    out = np.zeros(len(capacity))
    left = float(demand)
    for i in np.argsort(-np.asarray(score), kind="stable"):
        out[i] = min(left, float(capacity[i]))
        left -= out[i]
    return out


# --- The operator's suppliers -----------------------------------------------------------------------------------

def _exposure(chokepoints: tuple[str, ...], mode: str) -> float:
    return min(1.0, sum(CHOKEPOINT_WEIGHT.get(c, 0.0) for c in chokepoints) + (AIR_EXPOSURE if mode == "air" else 0.0))


def _terms_metrics(terms: SupplyTerms) -> tuple[float, float]:
    mean, _ = terms.delay_moments()
    on_time = 100.0 * (1 - terms.p_miss) * (1 - terms.p_late - terms.p_late2) * (1 - terms.p_short)
    return mean, on_time


def supplier_metrics() -> tuple[list[dict], np.ndarray, np.ndarray]:
    """(supplier records, normal metrics matrix, Hormuz-2026 metrics matrix), in route order."""
    routes = {r.supplier_id: r for r in SUPPLIER_ROUTES}
    cats = {c.id: c for c in CATEGORIES}
    records, normal, disrupted = [], [], []
    for sup in suppliers():
        route = routes[sup.id]
        km = route_distance_km(route)
        supplied = [s for s in SKUS if s.supplier_id == sup.id]
        life = np.mean([shelf_life_days(s) for s in supplied])
        transit = TRANSIT_DAYS[route.mode] if TRANSIT_DAYS[route.mode] is not None else km / SEA_KM_PER_DAY + SEA_PORT_DAYS
        freshness = 100.0 * life / (life + transit)
        rejects = 100.0 * float(np.mean([cats[s.category_id].handling_loss for s in supplied]))
        carbon = km * transport_factor(route.mode) / 1000.0
        cost = REFERENCE_COST_AED_PER_KG * LANDED_COST_FACTOR[sup.id]
        exposure = _exposure(route.chokepoint_ids, route.mode)
        lead, on_time = _terms_metrics(sup.normal)
        normal.append([cost, lead, on_time, freshness, rejects, exposure, carbon])
        d_lead, d_on_time = _terms_metrics(sup.disrupted or sup.normal)
        d_exposure = min(1.0, exposure * 1.5) if sup.disrupted else exposure
        disrupted.append([cost, d_lead, d_on_time, freshness, rejects, d_exposure, carbon])
        records.append({"id": sup.id, "name": sup.name, "archetype": CONTRACT_ARCHETYPE[sup.archetype],
                        "origin": route.place_ids[0], "mode": route.mode, "routeId": f"route-{sup.id.removeprefix('sup-')}",
                        "chokepoints": list(route.chokepoint_ids),
                        "capacityPerDay": float(CAPACITY_KG_PER_DAY[sup.archetype])})
    return records, np.array(normal), np.array(disrupted)


def mcdm_body() -> dict[str, object]:
    """The mcdm.json body (contract: web/src/lib/contracts/mcdm.ts)."""
    records, normal, hormuz = supplier_metrics()
    weights = ahp(saaty_from_importance(IMPORTANCE))
    if weights["cr"] >= 0.10:
        raise ValueError(f"board-preference AHP matrix is inconsistent (CR {weights['cr']})")
    entropy = entropy_weights(normal)
    entropy = (entropy / entropy.sum()).round(6)
    entropy[-1] = round(1.0 - entropy[:-1].sum(), 6)
    for rec, row in zip(records, normal):
        rec["metrics"] = {cid: round(float(v), 4) for cid, v in zip(CRITERION_IDS, row)}
    adjustments = []
    for rec, a, b in zip(records, normal, hormuz):
        for j, cid in enumerate(CRITERION_IDS):
            if abs(b[j] - a[j]) > 1e-9:
                adjustments.append({"supplierId": rec["id"], "criterionId": cid, "op": "add",
                                    "value": round(float(b[j] - a[j]), 4)})
    return {"criteria": [{"id": c[0], "label": c[1], "type": c[2], "unit": c[3], "description": c[4]} for c in CRITERIA],
            "ahp": weights, "entropyWeights": entropy.tolist(), "suppliers": records,
            "scenarios": [{"id": "hormuz2026", "label": "Hormuz 2026",
                           "description": ("Orders placed 1 Mar-31 May 2026: sea and air importers take the disruption "
                                           "terms the simulation uses (longer, less reliable deliveries; higher exposure)."),
                           "adjustments": adjustments}]}


def ranking(scenario: str = "normal", weights: np.ndarray | None = None) -> dict[str, float]:
    """TOPSIS closeness per supplier id under the board-preference AHP weights (or `weights`)."""
    records, normal, hormuz = supplier_metrics()
    w = np.asarray(weights if weights is not None else ahp(saaty_from_importance(IMPORTANCE))["weights"])
    x = hormuz if scenario == "hormuz2026" else normal
    return {r["id"]: float(s) for r, s in zip(records, topsis(x, w, BENEFIT))}


def apply_scenario(body: dict, scenario_id: str | None) -> np.ndarray:
    """The (suppliers × criteria) matrix of an mcdm.json body, with a scenario's adjustments applied."""
    ids = [c["id"] for c in body["criteria"]]
    x = np.array([[s["metrics"][c] for c in ids] for s in body["suppliers"]], dtype=float)
    scenario = next((sc for sc in body["scenarios"] if sc["id"] == scenario_id), None)
    if scenario:
        rows = {s["id"]: i for i, s in enumerate(body["suppliers"])}
        for adj in scenario["adjustments"]:
            i, j = rows[adj["supplierId"]], ids.index(adj["criterionId"])
            x[i, j] = x[i, j] * adj["value"] if adj["op"] == "multiply" else x[i, j] + adj["value"]
    return x


def golden_cases(body: dict) -> dict[str, object]:
    """Test-only parity cases for the browser's TOPSIS (web/tests/fixtures/golden/mcdm_cases.json, P8-02)."""
    benefit = np.array([c["type"] == "benefit" for c in body["criteria"]])
    cases = []
    for scenario in (None, *[sc["id"] for sc in body["scenarios"]]):
        x = apply_scenario(body, scenario)
        for mode, w in (("ahp", body["ahp"]["weights"]), ("entropy", body["entropyWeights"])):
            closeness = topsis(x, np.asarray(w), benefit)
            cases.append({"scenario": scenario, "weightMode": mode, "closeness": closeness.round(9).tolist(),
                          "ranks": ranks(closeness).tolist(),
                          "sensitivity": [{"change": r["change"], "topUnchanged": r["topUnchanged"], "ranks": r["ranks"]}
                                          for r in sensitivity(x, np.asarray(w), benefit)]})
    from .optimise import COMPATIBLE

    return {"tolerance": 1e-6, "entropyFromMetrics": entropy_weights(apply_scenario(body, None)).round(9).tolist(),
            "compatible": {k: list(v) for k, v in COMPATIBLE.items()}, "cases": cases}

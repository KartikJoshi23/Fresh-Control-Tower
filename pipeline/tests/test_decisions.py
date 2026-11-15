"""Part 4: MCDM (P4-03), ordering policies and the surge planner (P4-01, P4-02), the browser engine reference
and its golden cases (P4-06), and golden checks on the committed backtest outputs (P4-04, P4-05).
"""

from __future__ import annotations

import json
import math

import numpy as np
import pytest
from scipy.stats import norm

from freshpipe import engine_reference as er
from freshpipe import mcdm, optimise
from freshpipe.config import repo_path
from freshpipe.simulate import SeriesParams, State, SupplyModel


# --- MCDM -------------------------------------------------------------------------------------------------------

def test_entropy_and_topsis_reproduce_a_published_example() -> None:
    # "Selected multi-criteria decision-making methods and their applications to product and system design",
    # arXiv:2407.09931, ch. 15, Exercise 2 and its answer key: A, D, E are minimised; B, C maximised.
    x = np.array([[20, 8, 13, 4, 9], [5, 2, 8, 17, 10], [4, 17, 6, 2, 1], [6, 6, 9, 15, 3]], dtype=float)
    benefit = np.array([False, True, True, False, False])
    w = mcdm.entropy_weights(x)
    assert w == pytest.approx([0.233374, 0.216633, 0.03823, 0.262035, 0.249728], abs=5e-7)
    closeness = mcdm.topsis(x, np.array([0.233374, 0.216633, 0.03823, 0.262035, 0.249728]), benefit)
    assert closeness == pytest.approx([0.398895, 0.358287, 0.958917, 0.508982], abs=5e-7)
    assert mcdm.ranks(closeness).tolist() == [3, 4, 1, 2]


def test_ahp_on_a_perfectly_consistent_matrix() -> None:
    # a_ij = v_i / v_j is perfectly consistent: weights = v / Σv, λmax = n, CI = CR = 0.
    v = np.array([4.0, 2.0, 1.0, 1.0])
    out = mcdm.ahp(v[:, None] / v[None, :])
    assert out["weights"] == pytest.approx((v / v.sum()).tolist(), abs=1e-6)
    assert out["lambdaMax"] == pytest.approx(4.0) and out["cr"] == pytest.approx(0.0, abs=1e-6) and out["ri"] == 0.90


def test_board_preference_matrix_is_reciprocal_and_consistent() -> None:
    a = mcdm.saaty_from_importance(mcdm.IMPORTANCE)
    assert np.allclose(a * a.T, 1.0) and a[2, 4] == 7.0 and a[4, 2] == pytest.approx(1 / 7)
    assert mcdm.ahp(a)["cr"] < 0.10
    with pytest.raises(ValueError):
        mcdm.ahp(np.array([[1.0, 3.0], [3.0, 1.0]]))


def test_allocation_lp_agrees_with_the_greedy_rule() -> None:
    score, cap = np.array([0.9, 0.6, 0.8]), np.array([100.0, 500.0, 50.0])
    lp, greedy = mcdm.allocate_lp(400.0, cap, score), mcdm.allocate_greedy(400.0, cap, score)
    assert lp == pytest.approx(greedy, abs=1e-6) and greedy.tolist() == [100.0, 250.0, 50.0]


def test_committed_mcdm_json_meets_the_web_contract_rules() -> None:
    doc = json.loads((repo_path("web_data") / "mcdm.json").read_text(encoding="utf-8"))
    a = np.array(doc["ahp"]["matrix"])
    assert np.abs(a * a.T - 1.0).max() < 1e-9                   # reciprocity, as mcdm.ts checks it
    assert sum(doc["ahp"]["weights"]) == pytest.approx(1.0, abs=1e-3) and doc["ahp"]["cr"] < 0.10
    assert sum(doc["entropyWeights"]) == pytest.approx(1.0, abs=1e-3) and doc["isFixture"] is False
    hormuz = mcdm.ranking("hormuz2026")
    assert hormuz["sup-sea-khorfakkan"] > hormuz["sup-sea-import"] > hormuz["sup-sea-europe"]


# --- Ordering ----------------------------------------------------------------------------------------------------

def test_newsvendor_critical_ratio_at_the_real_median_markup() -> None:
    # Without goodwill or disposal, Cu = 0.66c and Co = c at the real median markup of 1.66 -> 0.66/1.66 = 0.40.
    cost = optimise.CostModel(np.array([1.66]), np.array([1.0]), np.array([0.0]))
    cu = cost.price - cost.unit_cost
    assert float((cu / (cu + cost.unit_cost))[0]) == pytest.approx(0.3976, abs=1e-4)
    # With 10% goodwill the critical ratio rises: (0.66 + 0.166) / (0.826 + 1) = 0.452.
    assert float(optimise.critical_ratio(cost)[0]) == pytest.approx(0.826 / 1.826, abs=1e-4)
    assert optimise.newsvendor_quantity(100, 20, 1, 1) == pytest.approx(100.0)
    assert optimise.newsvendor_quantity(100, 20, 9, 1) == pytest.approx(100 + 20 * norm.ppf(0.9))


def tiny_policy(tau: float = 0.5, lead: int = 2, **kwargs) -> tuple[optimise.AIPolicy, State]:
    n, days = 1, 40
    fc = np.zeros((3, 3, n, days))
    fc[:, 0], fc[:, 1], fc[:, 2] = 10 - 2 * optimise.Z90, 10.0, 10 + 2 * optimise.Z90   # μ = 10, σ = 2 every day
    supply = SupplyModel(np.array([lead]), np.zeros(1), np.zeros(1), np.zeros(1), np.zeros(1),
                         np.array([[lead], [0], [0], [0], [0]]), (10 ** 9, 10 ** 9))
    prm = SeriesParams(np.array([5]), np.array([1]), np.array([0.0]), np.array([0]), np.array([lead]))
    policy = optimise.AIPolicy("P1", fc, np.array([tau]), supply, np.full((n, days, 24), 1 / 24), np.zeros(n, int), **kwargs)
    state = State(3, 22, np.array([4]), np.array([6]), np.zeros((n, 28 + days)), 28, np.arange(days) % 7, prm,
                  np.zeros((n, days)))
    return policy, state


def test_ai_order_worked_example() -> None:
    # Lead 2 -> covers 2 days: μ = 20; σ_C = √(0.3 × (2 + 2)² + 0.7 × (4 + 4)) = √10.4; at τ = 0.5 z = 0.
    policy, state = tiny_policy(0.5)
    level, cap = policy.level(state, state.params.supplier)
    assert level[0] == pytest.approx(20.0)
    # Shelf-life guard: sellable from day 2 for 5 days -> Σ μ over days 2..6 = 50, minus 10 held -> cap 40.
    assert cap[0] == pytest.approx(40.0)
    batch, = policy.orders(state)
    assert batch.qty.tolist() == [10]                           # 20 - 4 on hand - 6 on order
    policy90, state90 = tiny_policy(0.9)
    assert policy90.level(state90, state90.params.supplier)[0][0] == pytest.approx(20 + norm.ppf(0.9) * math.sqrt(10.4))


def test_noon_top_up_worked_example() -> None:
    # Flat profile: by the end of 11:00 half the day has passed (mass 0.5). Sold 8 so far, P50 10:
    # level = (8 + 0.3 × 10) / (0.5 + 0.3) = 13.75 -> rest of day 6.875; at τ = 0.5 need = 6.875; 2 on hand -> 5.
    policy, state = tiny_policy(0.5, intraday=True)
    state.hour, state.on_hand, state.sales_today = 11, np.array([2]), np.array([8.0])
    assert policy.topup_hour == optimise.TOPUP_HOUR
    assert policy.topup(state).tolist() == [5]


def test_smart_sourcing_switches_only_disrupted_skus() -> None:
    ids = ["sup-sea-import", "sup-sea-khorfakkan", "sup-air-import", "sup-gcc-ksa", "sup-sea-europe", "sup-local-farm",
           "sup-gcc-truck", "sup-air-europe", "sup-local-bakery"]
    scores = {s: 0.5 for s in ids} | {"sup-sea-khorfakkan": 0.9}
    bananas = [k for k, s in enumerate(optimise.SKUS) if s.id == "bananas-1kg"][0]
    laban = [k for k, s in enumerate(optimise.SKUS) if s.id == "laban-1l"][0]
    alt = optimise.smart_sourcing_suppliers(np.array([bananas, laban]), ids, scores, {"sup-sea-import"})
    assert [ids[i] for i in alt] == ["sup-sea-khorfakkan", "sup-gcc-ksa"]


def test_surge_planner_worked_example() -> None:
    # A 3-day spike from day 10, +50 units a day, announced on day 2. Shelf life 4, min remaining 1 -> 3 sellable
    # days. Primary lead 3: latest safe order = 10 - 3 - 1 = day 6 (open). One delivery on day 9 covers days
    # 10-11 only (sellable to day 11), so a second delivery is needed for day 12.
    fast, slow = optimise.SupplierOption("fast", 1, 1.3, 0.05), optimise.SupplierOption("primary", 3, 1.0, 0.02)
    out = optimise.plan_surge(2, 10, 3, 50.0, 4, 1, [slow, fast], unit_cost=3.0, price=6.0, kg_per_unit=0.5)
    assert out["latestSafeOrderDay"] == {"primary": 6, "fast": 8}
    assert out["singleDeliveryCoversDays"] == 2 and out["earliestUsefulArrivalDay"] == 10
    by = {o["option"]: o for o in out["options"]}
    assert by["prebuild_primary"]["lostUnits"] == 50.0 and by["split"]["lostUnits"] == 0.0
    assert by["accept_shortfall"]["lostUnits"] == 150.0 and out["minimumWarningDays"] == 2
    late = optimise.plan_surge(8, 10, 1, 50.0, 4, 1, [slow, fast], unit_cost=3.0, price=6.0, kg_per_unit=0.5)
    assert {o["option"]: o for o in late["options"]}["prebuild_primary"]["note"].startswith("Order window closed")


# --- Browser engine reference --------------------------------------------------------------------------------------

def test_mulberry32_matches_javascript() -> None:
    # Values printed by the reference JavaScript implementation under Node 22 for seed 42.
    r = er.mulberry32(42)
    assert [round(r(), 12) for _ in range(5)] == [0.60110375192, 0.448290558998, 0.85246579349, 0.669734041439,
                                                   0.174813898746]
    r0 = er.mulberry32(0)
    assert round(r0(), 12) == 0.266429208685


def test_norm_ppf_and_rounding() -> None:
    for p in (0.01, 0.1, 0.5, 0.85, 0.999):
        assert er.norm_ppf(p) == pytest.approx(float(norm.ppf(p)), abs=1e-8)
    assert (er.round_half_up(2.5), er.round_half_up(-0.4), er.round_to_case(17, 6), er.round_to_case(-3, 6)) == (3, 0, 18, 0)


def flat_engine(p50: float = 10.0, lead: float = 1.0, life: int = 3) -> dict:
    return {"planningStart": "2026-02-11",
            "horizonQuantiles": [{"date": f"2026-02-{11 + j:02d}", "p10": p50 * 0.8, "p50": p50, "p90": p50 * 1.2}
                                 for j in range(10)],
            "leadTimes": [{"supplierId": "s", "meanDays": lead, "sdDays": 0.0}], "shelfLifeDays": life,
            "minRemainingShelfLifeDays": 1, "unitCostAED": 2.0, "priceAED": 4.0, "holdingCostPerUnitDayAED": 0.01,
            "wasteDisposalPerUnitAED": 0.1, "goodwillPerUnitAED": 0.4, "reviewPeriodDays": 1, "casePack": 1,
            "intradayProfile": [1 / 24] * 24, "ramadanProfile": [1 / 24] * 24, "optimalTau": 0.5,
            "initialOnHand": 10, "onOrder": []}


def test_engine_worked_example_steady_state() -> None:
    # Demand 10 a day; 10 on hand; lead 1, τ 0.5: each night orders 10 for the next dawn. Nothing is lost or wasted.
    out = er.run_engine(flat_engine(), {"policy": "AI"})
    assert [r["sales"] for r in out["rows"]] == [10] * 10 and out["kpis"]["lost"] == 0 and out["kpis"]["waste"] == 0
    assert [r["order"] for r in out["rows"][:3]] == [10, 10, 10]
    # A manual order of 60 on day 0 lands on day 1 with a 3-day shelf life: 30 sell (days 1-3), 30 expire on day 3.
    over = er.run_engine(flat_engine(), {"policy": "AI", "manualOrder": {"day": 0, "qty": 60}})
    assert over["kpis"]["waste"] == 30 and over["kpis"]["lost"] == 0 and over["rows"][3]["waste"] == 30
    # Unannounced spike x3 on day 4: the shelf runs short that day.
    spike = er.run_engine(flat_engine(), {"policy": "AI", "spike": {"startDay": 4, "days": 1, "magnitude": 3, "warningDays": 0}})
    assert spike["rows"][4]["lost"] == 20


def test_golden_cases_reproduce_from_the_committed_series_files() -> None:
    golden = json.loads((repo_path("web_data").parent.parent / "tests" / "fixtures" / "golden" / "engine_cases.json")
                        .read_text(encoding="utf-8"))
    assert golden["prng"]["first5"][0] == 0.60110375192 and len(golden["cases"]) == 24
    for case in golden["cases"][:: 5]:
        series = json.loads((repo_path("web_data") / "series" / f"{case['storeId']}__{case['skuId']}.json").read_text())
        assert series["engine"] == case["engine"]
        assert er.run_engine(case["engine"], case["scenario"]) == case["deterministic"]
        assert er.monte_carlo(case["engine"], case["scenario"], case["monteCarlo"]["runs"], case["monteCarlo"]["seed"]) \
            == case["monteCarlo"]["kpis"]


# --- Golden checks on the committed backtest artefacts -------------------------------------------------------------

@pytest.fixture(scope="module")
def backtest_doc() -> dict:
    return json.loads((repo_path("web_data") / "backtest.json").read_text(encoding="utf-8"))


def _kpi(doc: dict, window: str, policy: str, key: str) -> float:
    return next(r for r in doc["results"] if r["windowId"] == window and r["policyId"] == policy)["kpis"][key]["p50"]


def test_ai_ladder_cuts_lost_sales_and_cost_in_every_window(backtest_doc: dict) -> None:
    assert backtest_doc["isFixture"] is False
    for w in backtest_doc["windows"]:
        p0 = _kpi(backtest_doc, w["id"], "P0", "lostSalesUnits")
        for pid in ("P1", "P2", "P3"):
            assert _kpi(backtest_doc, w["id"], pid, "lostSalesUnits") < 0.7 * p0, (w["id"], pid)
            assert _kpi(backtest_doc, w["id"], pid, "totalCostAED") < _kpi(backtest_doc, w["id"], "P0", "totalCostAED")
    # Real-time visibility (P2) beats daily AI (P1) on availability in the test window (KQ3).
    assert _kpi(backtest_doc, "test-2026", "P2", "availabilityPct") > _kpi(backtest_doc, "test-2026", "P1", "availabilityPct")
    # Smart sourcing (P3) beats P2 in the Hormuz window (KQ5).
    assert _kpi(backtest_doc, "hormuz", "P3", "lostSalesUnits") < _kpi(backtest_doc, "hormuz", "P2", "lostSalesUnits")


def test_frontier_ai_wastes_less_at_equal_availability() -> None:
    doc = json.loads((repo_path("web_data") / "frontier.json").read_text(encoding="utf-8"))
    curves = {c["policyId"]: c["points"] for c in doc["curves"]}
    ai = sorted(curves["P1"], key=lambda p: p["availabilityPct"])
    for p in curves["P0"]:
        if ai[0]["availabilityPct"] <= p["availabilityPct"] <= ai[-1]["availabilityPct"]:
            waste = np.interp(p["availabilityPct"], [q["availabilityPct"] for q in ai], [q["wastePct"] for q in ai])
            assert waste < p["wastePct"]


def test_impact_waterfall_adds_up() -> None:
    doc = json.loads((repo_path("web_data") / "impact.json").read_text(encoding="utf-8"))
    steps = doc["waterfall"]
    assert steps[0]["kind"] == "baseline" and steps[-1]["kind"] == "total"
    assert steps[0]["valueAED"] + sum(s["valueAED"] for s in steps[1:-1]) == pytest.approx(steps[-1]["valueAED"], abs=5)


def test_mcdm_golden_cases_match_the_shipped_file() -> None:
    # The browser's TOPSIS parity file is derived from mcdm.json itself (rounded metrics), so it stays in step.
    body = json.loads((repo_path("web_data") / "mcdm.json").read_text(encoding="utf-8"))
    golden = json.loads((repo_path("web_data").parent.parent / "tests" / "fixtures" / "golden" / "mcdm_cases.json")
                        .read_text(encoding="utf-8"))
    fresh = mcdm.golden_cases(body)
    assert [c["ranks"] for c in fresh["cases"]] == [c["ranks"] for c in golden["cases"]]
    assert np.allclose([c["closeness"] for c in fresh["cases"]], [c["closeness"] for c in golden["cases"]], atol=1e-9)

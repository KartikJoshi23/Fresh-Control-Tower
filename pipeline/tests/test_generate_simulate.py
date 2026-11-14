"""Hourly inventory engine and the P0 legacy rule (task P2-02): worked examples on hand-built worlds.

Each example is small enough to check by hand; the comments give the arithmetic. The full 320-series
run is covered in test_generate_fidelity.py.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from freshpipe.generate import World
from freshpipe.simulate import (RING, STATUS_LATE, STATUS_MISSED, STATUS_ON_TIME, BaselinePolicy, OrderBatch,
                                SeriesParams, State, SupplyModel, _place, consume_fifo, round_to_case, simulate)

CONFIG = {"world": {"receiving_hour": 6, "review_hour": 22, "handling_concentration": 3.0,
                    "hormuz_2026": {"start": "2099-01-01", "end": "2099-01-02"}}}


def perfect_supply(lead: int = 1, n_suppliers: int = 1, **terms: float) -> SupplyModel:
    """Supply with fixed lead time and the given probabilities (default: always on time and in full)."""
    p = {k: np.full(n_suppliers, terms.get(k, 0.0)) for k in ("p_late", "p_late2", "p_miss", "p_short")}
    row = np.vstack([np.full(n_suppliers, lead), p["p_late"], p["p_late2"], p["p_miss"], p["p_short"]])
    return SupplyModel(np.full(n_suppliers, lead), p["p_late"], p["p_late2"], p["p_miss"], p["p_short"],
                       row, (10 ** 9, 10 ** 9))


def params(n: int, shelf: int = 3, case: int = 1, loss: float = 0.0, lead: int = 1) -> SeriesParams:
    return SeriesParams(np.full(n, shelf), np.full(n, case), np.full(n, loss), np.zeros(n, dtype=int),
                        np.full(n, lead))


def tiny_world(demand_per_day: list[int], n_days: int = 42, hour: int = 12, expected: float = 5.0) -> World:
    """One series per entry of `demand_per_day`, all demand in one hour; 28 warm-up days."""
    n = len(demand_per_day)
    demand_h = np.zeros((n, n_days, 24), dtype=np.int32)
    demand_h[:, :, hour] = np.asarray(demand_per_day)[:, None]
    return World(seed=1, dates=pd.date_range("2026-01-01", periods=n_days), n_warmup=28,
                 expected=np.full((n, n_days), expected, dtype=np.float32),
                 multiplier=np.ones((n, n_days), dtype=np.float32), demand_h=demand_h,
                 promo_depth=np.zeros((1, n_days), dtype=np.float32), event_kind=np.zeros((n, n_days), np.int8),
                 day_labels=pd.DataFrame(), series_sku=np.zeros(n, dtype=int))


# --- Building blocks ----------------------------------------------------------------------------------------

def test_round_to_case_rounds_half_up_and_never_orders_negative() -> None:
    raw = np.array([0.0, -3.0, 4.9, 5.0, 14.9, 15.0])
    assert round_to_case(raw, np.full(6, 10)).tolist() == [0, 0, 0, 10, 10, 20]


def test_fifo_takes_the_oldest_stock_first() -> None:
    stock = np.array([[3, 2, 5], [0, 0, 4], [1, 1, 1]])           # column 0 = oldest
    left, taken = consume_fifo(stock, np.array([4, 9, 0]))
    assert left.tolist() == [[0, 1, 5], [0, 0, 0], [1, 1, 1]]
    assert taken.tolist() == [4, 4, 0]                            # the second row sells only what it has


def state_for(history: np.ndarray, day: int, prm: SeriesParams, promo: np.ndarray | None = None,
              on_hand: int = 0, on_order: int = 0) -> State:
    n = history.shape[0]
    days = history.shape[1] - 28
    return State(day, 22, np.full(n, on_hand), np.full(n, on_order), history, 28,
                 np.arange(days) % 7, prm, promo if promo is not None else np.zeros((n, days)))


def test_p0_order_worked_example() -> None:
    # Flat recorded sales of 10 a day; lead time 3 and a daily review, so the order covers 3 + 1 - 1 = 3 days.
    # S = 1.2 x 30 = 36, grossed up for a 10% handling loss: 36 / 0.9 = 40.
    # Order = 40 - 7 on hand - 12 on order = 21 -> 3.5 cases of 6 -> rounds half up to 4 cases = 24 units.
    prm = params(1, case=6, loss=0.10, lead=3)
    state = state_for(np.full((1, 28 + 60), 10.0), 30, prm, on_hand=7, on_order=12)
    policy = BaselinePolicy()
    assert policy.level(state)[0] == pytest.approx(40.0)
    batch, = policy.orders(state)
    assert batch.qty.tolist() == [24]


def test_p0_uses_same_weekday_averages_promotions_and_a_minimum() -> None:
    # Recorded sales follow the weekday: column c holds (c mod 7) + 1, so same weekdays share a value.
    # On day 30 (column 58) the three covered days are columns 59, 60, 61 -> values 4, 5, 6 -> 15.
    history = np.tile((np.arange(28 + 60) % 7 + 1).astype(float), (2, 1))
    prm = SeriesParams(np.full(2, 3), np.array([1, 50]), np.zeros(2), np.zeros(2, dtype=int), np.array([3, 1]))
    plain = BaselinePolicy(shrink_allowance=False, min_cases=0)
    state = state_for(history, 30, prm)
    # Series 0: 1.2 x 15 = 18. Series 1 (lead 1, covers 1 day): 1.2 x 4 = 4.8.
    assert plain.level(state).tolist() == pytest.approx([18.0, 4.8])
    # The minimum presentation stock lifts series 1 to one case of 50.
    assert BaselinePolicy(shrink_allowance=False).level(state).tolist() == pytest.approx([18.0, 50.0])
    # A known promotion on day 32 (j = 2) adds the flat 25%: 4 + 5 x 1.25 + 6 = 16.25 -> 19.5.
    promo = np.zeros((2, 60))
    promo[:, 32] = 0.2
    assert plain.level(state_for(history, 30, prm, promo))[0] == pytest.approx(19.5)
    # Without weekday awareness the 28-day mean is (1 + ... + 7) / 7 = 4 -> 1.2 x 3 x 4 = 14.4.
    flat = BaselinePolicy(shrink_allowance=False, min_cases=0, weekday_aware=False)
    assert flat.level(state)[0] == pytest.approx(14.4)


def test_p0_reads_its_parameters_from_the_config() -> None:
    policy = BaselinePolicy.from_config({"baseline_policy": {"moving_average_days": 28, "safety_buffer": 0.2,
                                                             "review_period_days": 1, "weekday_aware": True}})
    assert (policy.ma_days, policy.buffer, policy.min_cases, policy.promo_uplift) == (28, 0.2, 1, 0.25)


# --- Deliveries ------------------------------------------------------------------------------------------------

def book(supply: SupplyModel, qty: list[int], day: int = 5) -> tuple[np.ndarray, ...]:
    n = len(qty)
    arriving, closing, on_order = (np.zeros((n, RING), dtype=np.int64), np.zeros((n, RING), dtype=np.int64),
                                   np.zeros(n, dtype=np.int64))
    rows = _place(OrderBatch(np.array(qty), np.zeros(n, dtype=int)), day, supply, np.random.default_rng(0),
                  arriving, closing, on_order)
    return rows, arriving, closing, on_order


def test_on_time_late_and_missed_deliveries() -> None:
    rows, arriving, closing, on_order = book(perfect_supply(lead=2), [10, 0])
    assert rows.tolist() == [[0, 5, 0, 10, 7, 10, STATUS_ON_TIME]]  # the zero order is not logged
    assert arriving[0, 7 % RING] == 10 and on_order.tolist() == [10, 0]

    rows, arriving, _, _ = book(perfect_supply(lead=2, p_late2=1.0), [10])
    assert rows[0, 4] == 9 and rows[0, 6] == STATUS_LATE and arriving[0, 9 % RING] == 10

    rows, arriving, closing, on_order = book(perfect_supply(lead=2, p_miss=1.0), [10])
    assert rows[0, 4] == -1 and rows[0, 5] == 0 and rows[0, 6] == STATUS_MISSED
    assert arriving.sum() == 0 and closing[0, 7 % RING] == 10    # written off on its due day

    rows, arriving, _, _ = book(perfect_supply(lead=2, p_short=1.0), [100])
    assert 50 <= rows[0, 5] <= 90 and arriving.sum() == rows[0, 5]  # a short delivery brings 50-90%

    with pytest.raises(ValueError, match="RING"):
        book(perfect_supply(lead=RING - 1, p_late2=1.0), [1])


def test_disruption_terms_apply_inside_the_window_only() -> None:
    supply = perfect_supply(lead=2)
    hit = SupplyModel(supply.lead, supply.p_late, supply.p_late2, supply.p_miss, supply.p_short,
                      np.array([[7], [0.4], [0.2], [0.1], [0.7]]), (10, 20))
    assert hit.terms(9, np.array([0]))[0].tolist() == [2]
    assert [t.tolist() for t in hit.terms(10, np.array([0]))] == [[7], [0.4], [0.2], [0.1], [0.7]]
    assert hit.terms(21, np.array([0]))[0].tolist() == [2]


# --- Whole runs --------------------------------------------------------------------------------------------------

def test_worked_run_steady_item_and_dead_item() -> None:
    # Series 0 sells 5 a day at 12:00; series 1 never sells. Lead time 1, shelf life 3 days, case of 1.
    world = tiny_world([5, 0])
    run = simulate(world, BaselinePolicy(), config=CONFIG, params=params(2), supply=perfect_supply())
    led = run.daily
    # Opening stock = round(1.2 x 5 x 1) = 6 for both.
    assert led["opening"][:, 0].tolist() == [6, 6]
    # Series 0: day 0 sells 5, leaving 1; S = 1.2 x 5 = 6, so it orders 5, which lands at 06:00 next day.
    # From then on it sells exactly 5 a day, never runs out and never wastes (FIFO sells the 1 old unit first).
    assert np.all(led["sales"][0] == 5) and led["expired"][0].sum() == 0
    assert not run.oos_h[0].any() and np.all(led["receipts"][0, 1:] == 5)
    # Series 1: the opening 6 units expire at the end of day 2 (shelf life 3). The rule still sees the
    # pre-history (5 a day), so it re-orders 6 on day 3, received on day 4: the legacy rule's blind spot.
    assert led["expired"][1, :3].tolist() == [0, 0, 6]
    assert led["ordered"][1, :3].tolist() == [0, 0, 0] and led["ordered"][1, 3] == 6
    assert led["receipts"][1, 4] == 6 and led["sales"][1].sum() == 0
    # Stock flags: series 1 is out of stock from day 3 (00:00) until the delivery at 06:00 on day 4.
    assert run.oos_h[1, 3].all() and run.oos_h[1, 4, :6].all() and not run.oos_h[1, 4, 6:].any()


def test_stockouts_censor_sales() -> None:
    # Demand 20 a day but the rule only ever sees what it sold: sales never exceed what was on hand.
    world = tiny_world([20], expected=5.0)
    run = simulate(world, BaselinePolicy(), config=CONFIG, params=params(1), supply=perfect_supply())
    assert np.all(run.sales_h <= world.demand_h)
    assert run.daily["sales"][0, 0] == 6                          # sold out of the opening 6 units
    assert run.oos_h[0, 0, 12] and run.sales_h[0, 0, 12] == 6     # a censored "transition hour"


def test_handling_loss_is_waste_and_the_ledger_balances() -> None:
    world = tiny_world([30, 30], expected=30.0)
    run = simulate(world, BaselinePolicy(), config=CONFIG, params=params(2, loss=0.2), supply=perfect_supply())
    led = run.daily
    assert led["handling_loss"].sum() > 0
    share = led["handling_loss"].sum() / led["receipts"].sum()
    assert share == pytest.approx(0.2, abs=0.05)                  # beta-binomial around the category rate
    waste = led["handling_loss"] + led["expired"]
    assert np.array_equal(led["opening"] + led["receipts"] - led["sales"] - waste, led["closing"])


def test_runs_are_reproducible_and_the_run_index_changes_supply_draws() -> None:
    world = tiny_world([8, 8, 8, 8], expected=8.0)
    supply = perfect_supply(p_short=0.5, p_late=0.2)
    a = simulate(world, BaselinePolicy(), config=CONFIG, params=params(4), supply=supply, run=0)
    b = simulate(world, BaselinePolicy(), config=CONFIG, params=params(4), supply=supply, run=0)
    c = simulate(world, BaselinePolicy(), config=CONFIG, params=params(4), supply=supply, run=1)
    assert np.array_equal(a.sales_h, b.sales_h) and a.orders.equals(b.orders)
    assert not a.orders["delivered"].equals(c.orders["delivered"])

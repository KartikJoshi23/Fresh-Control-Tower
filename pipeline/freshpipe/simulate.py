"""Hourly inventory simulation and the P0 legacy policy (task P2-02, plan §3.4).

The engine plays every store-SKU through every hour, in parallel across series:

- **Stock-in.** Deliveries arrive at the receiving hour (06:00). A share of each delivery is culled for
  quality on receipt (handling loss, `world.Category.handling_loss`).
- **Stock-out.** Customers buy oldest stock first (FIFO), up to what is on hand; the rest of their demand
  is lost. Stock that reaches the end of its shelf life is thrown away at midnight.
- **Stock flags.** An hour is flagged out of stock when nothing is left at the end of it, the same
  meaning as FreshRetailNet's `hours_stock_status` (so an hour in which stock runs out is a censored
  "transition hour" with some sales).
- **Ordering.** A policy decides orders at the review hour (22:00). Each order's delivery is sampled from
  the supplier's terms (on time, late, short or missed), using the disruption terms for orders placed
  inside the Hormuz 2026 window.

The P0 baseline (`BaselinePolicy`) is the legacy rule the AI is compared against. It only sees
**recorded sales**, which stockouts censor, so it produces the censored history that Part 3 learns from.

Every day satisfies: opening + receipts - sales - waste = closing, where waste = handling loss + expiry.
Receipts include any same-day top-ups (`expedited`), used by the AI-Intraday policies of Part 4.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import numpy as np
import pandas as pd

from . import __version__
from .clean import N_TRADING_HOURS, TRADING_HOURS, first_stockout_hour
from .config import load_config, repo_path
from .generate import HOURS, World, checksum, series_ids, series_index
from .world import CATEGORIES, SHORT_FILL, SKUS, rng_for, shelf_life_days, suppliers

RING = 16  # days of future deliveries tracked; must exceed the longest lead time plus the longest delay
INITIAL_COVER = 1.2  # opening stock on the first simulated (warm-up) day, in days of expected demand per lead day
#: Same-day top-up channel (AI-Intraday, P2/P3): a UAE wholesale market. An order placed at the end of the
#: policy's `topup_hour` arrives at TOPUP_ARRIVAL_HOUR the same day; it is missed with TOPUP_P_MISS and short
#: (SHORT_FILL) with TOPUP_P_SHORT. ASSUMPTION (Part 4, docs/06-decisions.md).
TOPUP_ARRIVAL_HOUR = 16
TOPUP_P_MISS = 0.02
TOPUP_P_SHORT = 0.05

STATUS_ON_TIME, STATUS_LATE, STATUS_MISSED = 0, 1, 2
STATUS_NAMES = {STATUS_ON_TIME: "on_time", STATUS_LATE: "late", STATUS_MISSED: "missed"}


# --- Series parameters and supply ------------------------------------------------------------------------------

@dataclass(frozen=True)
class SeriesParams:
    """Per-series inventory parameters, derived from the catalogue (arrays of length n)."""

    shelf_life: np.ndarray
    case_pack: np.ndarray
    handling_loss: np.ndarray
    supplier: np.ndarray        # index into world.suppliers()
    lead_time: np.ndarray       # nominal lead time of the primary supplier (days)

    @classmethod
    def from_catalogue(cls) -> "SeriesParams":
        _, skus = series_index()
        supplier_ids = [s.id for s in suppliers()]
        cats = {c.id: c for c in CATEGORIES}
        sku_supplier = np.array([supplier_ids.index(s.supplier_id) for s in SKUS])
        terms = suppliers()
        return cls(
            shelf_life=np.array([shelf_life_days(s) for s in SKUS])[skus],
            case_pack=np.array([s.case_pack for s in SKUS])[skus],
            handling_loss=np.array([cats[s.category_id].handling_loss for s in SKUS])[skus],
            supplier=sku_supplier[skus],
            lead_time=np.array([terms[i].normal.lead_time_days for i in sku_supplier])[skus],
        )


@dataclass(frozen=True)
class SupplyModel:
    """Delivery terms per supplier, switching to disruption terms for orders placed in a day window."""

    lead: np.ndarray
    p_late: np.ndarray
    p_late2: np.ndarray
    p_miss: np.ndarray
    p_short: np.ndarray
    disrupted: np.ndarray       # (5, n_suppliers) the same fields during the disruption
    window: tuple[int, int]     # first and last order day index of the disruption (inclusive)

    @classmethod
    def build(cls, dates: pd.DatetimeIndex, start: str, end: str) -> "SupplyModel":
        normal = np.array([[s.normal.lead_time_days, s.normal.p_late, s.normal.p_late2, s.normal.p_miss,
                            s.normal.p_short] for s in suppliers()]).T
        hit = [s.disrupted or s.normal for s in suppliers()]
        disrupted = np.array([[t.lead_time_days, t.p_late, t.p_late2, t.p_miss, t.p_short] for t in hit]).T
        first = int(np.searchsorted(dates, pd.Timestamp(start)))
        last = int(np.searchsorted(dates, pd.Timestamp(end), side="right")) - 1
        return cls(normal[0].astype(int), normal[1], normal[2], normal[3], normal[4], disrupted, (first, last))

    def terms(self, day: int, supplier: np.ndarray) -> tuple[np.ndarray, ...]:
        """(lead, p_late, p_late2, p_miss, p_short) for orders placed on `day` with the given suppliers."""
        if self.window[0] <= day <= self.window[1]:
            d = self.disrupted
            return d[0][supplier].astype(int), d[1][supplier], d[2][supplier], d[3][supplier], d[4][supplier]
        return (self.lead[supplier], self.p_late[supplier], self.p_late2[supplier], self.p_miss[supplier],
                self.p_short[supplier])


# --- Policy interface -------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class OrderBatch:
    """Order quantities (units, one per series; 0 = no order) and the supplier index of each."""

    qty: np.ndarray
    supplier: np.ndarray


@dataclass
class State:
    """What a policy can see at a decision point."""

    day: int
    hour: int
    on_hand: np.ndarray             # (n,) units on hand now
    on_order: np.ndarray            # (n,) units ordered and not yet received (the system's view)
    sales_history: np.ndarray       # (n, PRE + days) recorded daily sales; column PRE + d is day d
    pre: int                        # number of pre-history columns
    weekday: np.ndarray             # (days,) Monday = 0
    params: SeriesParams
    promo: np.ndarray               # (n, days) announced promotion depth (0 = none); known in advance
    sales_today: np.ndarray | None = None   # (n,) units sold so far today (seen by intraday policies)


class Policy(Protocol):
    """A replenishment policy. Optionally it also has `topup_hour` (int) and `topup(state) -> qty array`,
    a same-day order placed at the end of that hour (see TOPUP_ARRIVAL_HOUR)."""

    name: str

    def orders(self, state: State) -> list[OrderBatch]:
        """Orders to place at this review."""


def round_to_case(raw: np.ndarray, case_pack: np.ndarray) -> np.ndarray:
    """Round a raw need to the nearest whole case (half up); needs of zero or less order nothing."""
    cases = np.floor(np.maximum(raw, 0.0) / case_pack + 0.5)
    return (cases * case_pack).astype(np.int64)


@dataclass(frozen=True)
class BaselinePolicy:
    """P0, the legacy rule (plan §3.4, clarified in decision D-21).

    Order-up-to level S = (1 + buffer) × the sum, over the days the order must cover, of the average
    RECORDED sales of that weekday over the last 28 days (four same weekdays). An order placed at the
    22:00 review arrives at dawn L days later, and the next order arrives one day after that, so the
    position must cover days t+1 … t+L: that is L + R - 1 days with a daily review (R = 1), because the
    night between the review and the dawn delivery carries almost no demand. Order = S minus on-hand
    minus on-order, rounded to whole cases, and never below `min_cases` cases (the minimum presentation
    stock that keeps a listed item on the shelf). With `shrink_allowance`, S is grossed up by the category's
    known handling-loss rate (purchase = sales ÷ (1 - loss rate), the convention of the CUMCM 2023
    problem the Kaggle data comes from), because an operator sees its own waste records. The rule cannot
    see lost demand, promotions, festivals, weather or expiry: those are exactly the gaps the AI closes.
    """

    ma_days: int = 28
    buffer: float = 0.20
    review_period: int = 1
    weekday_aware: bool = True
    shrink_allowance: bool = True
    min_cases: int = 1
    promo_uplift: float = 0.25
    name: str = "P0"

    def level(self, state: State) -> np.ndarray:
        """Order-up-to level S per series."""
        coverage = state.params.lead_time + self.review_period - 1
        hist = state.sales_history
        today = state.pre + state.day
        weeks = self.ma_days // 7
        total = np.zeros(hist.shape[0])
        for j in range(1, int(coverage.max()) + 1):
            if self.weekday_aware:
                m0 = -(-(j + 1) // 7)                       # first m with day + j - 7m <= yesterday
                cols = [today + j - 7 * m for m in range(m0, m0 + weeks)]
                avg = hist[:, cols].mean(axis=1)
            else:
                avg = hist[:, today - self.ma_days:today].mean(axis=1)
            if state.day + j < state.promo.shape[1]:
                avg = avg * np.where(state.promo[:, state.day + j] > 0, 1.0 + self.promo_uplift, 1.0)
            total += np.where(j <= coverage, avg, 0.0)
        level = (1.0 + self.buffer) * total
        if self.shrink_allowance:
            level /= 1.0 - state.params.handling_loss
        # Minimum presentation stock: a listed item always gets at least `min_cases` cases on the shelf.
        return np.maximum(level, self.min_cases * state.params.case_pack)

    def orders(self, state: State) -> list[OrderBatch]:
        raw = self.level(state) - state.on_hand - state.on_order
        return [OrderBatch(round_to_case(raw, state.params.case_pack), state.params.supplier)]

    @classmethod
    def from_config(cls, config: dict) -> "BaselinePolicy":
        p = config["baseline_policy"]
        return cls(ma_days=int(p["moving_average_days"]), buffer=float(p["safety_buffer"]),
                   review_period=int(p["review_period_days"]), weekday_aware=bool(p["weekday_aware"]),
                   shrink_allowance=bool(p.get("shrink_allowance", True)),
                   min_cases=int(p.get("minimum_presentation_cases", 1)),
                   promo_uplift=float(p.get("promo_uplift", 0.25)))


# --- Engine -------------------------------------------------------------------------------------------------------

def consume_fifo(stock: np.ndarray, qty: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Take up to `qty` units per row from stock buckets ordered oldest first. Returns (stock, taken)."""
    cum = np.cumsum(stock, axis=1)
    take = np.clip(qty[:, None] - (cum - stock), 0, stock)
    return stock - take, take.sum(axis=1)


@dataclass
class RunResult:
    """Outputs of one simulation run. Arrays cover every simulated day, warm-up included."""

    policy: str
    dates: pd.DatetimeIndex
    n_warmup: int
    sales_h: np.ndarray        # (n, d, 24) units sold
    oos_h: np.ndarray          # (n, d, 24) out of stock at the end of the hour
    on_hand_h: np.ndarray      # (n, d, 24) units on hand at the end of the hour
    daily: dict[str, np.ndarray]   # (n, d) ledger columns
    orders: pd.DataFrame       # one row per order placed
    params: dict[str, object] = field(default_factory=dict)

    @property
    def horizon(self) -> slice:
        return slice(self.n_warmup, len(self.dates))


def simulate(world: World, policy: Policy, *, config: dict | None = None, params: SeriesParams | None = None,
             supply: SupplyModel | None = None, run: int = 0) -> RunResult:
    """Run `policy` over the world, hour by hour.

    `run` selects independent supply and handling draws (Monte Carlo in Part 4). `params` and `supply`
    default to the catalogue and its suppliers; tests pass small hand-built ones.
    """
    config = config or load_config()
    params = params or SeriesParams.from_catalogue()
    receive_hour, review_hour = int(config["world"]["receiving_hour"]), int(config["world"]["review_hour"])
    kappa = float(config["world"]["handling_concentration"])
    cull_a = np.maximum(params.handling_loss * kappa, 1e-9)
    cull_b = np.maximum((1.0 - params.handling_loss) * kappa, 1e-9)
    hormuz = config["world"]["hormuz_2026"]
    supply = supply or SupplyModel.build(world.dates, hormuz["start"], hormuz["end"])
    rng_supply = rng_for(world.seed, "supply", run)
    rng_handling = rng_for(world.seed, "handling", run)

    n, n_days = world.n_series, len(world.dates)
    demand_h = world.demand_h
    weekday = world.dates.dayofweek.to_numpy()
    width = int(params.shelf_life.max())
    rows = np.arange(n)
    fresh_bucket = params.shelf_life - 1
    promo = world.promo_by_series                       # announced promotions, per series

    # Pre-history for the moving average: the expected demand of the same weekday four weeks later.
    pre = 28
    history = np.zeros((n, pre + n_days))
    history[:, :pre] = np.round(world.expected[:, :pre].astype(float) * world.multiplier[:, :pre])

    # Opening stock covers the days until the first order can arrive.
    stock = np.zeros((n, width), dtype=np.int64)
    stock[rows, fresh_bucket] = np.round(INITIAL_COVER * world.expected[:, 0] * params.lead_time).astype(np.int64)
    arriving = np.zeros((n, RING), dtype=np.int64)     # units that will physically arrive, by day slot
    closing = np.zeros((n, RING), dtype=np.int64)      # units the system will stop counting as on order
    on_order = np.zeros(n, dtype=np.int64)

    sales_h = np.zeros((n, n_days, HOURS), dtype=np.int32)
    oos_h = np.zeros((n, n_days, HOURS), dtype=bool)
    on_hand_h = np.zeros((n, n_days, HOURS), dtype=np.int32)
    ledger = {k: np.zeros((n, n_days), dtype=np.int64) for k in
              ("opening", "receipts", "handling_loss", "expired", "sales", "closing", "ordered", "on_order",
               "expedited")}
    order_rows: list[np.ndarray] = []
    topup_hour = getattr(policy, "topup_hour", None)
    arriving_pm = np.zeros(n, dtype=np.int64)          # same-day top-up units due at TOPUP_ARRIVAL_HOUR

    for d in range(n_days):
        slot = d % RING
        ledger["opening"][:, d] = stock.sum(axis=1)
        for h in range(HOURS):
            if h == receive_hour:
                got = arriving[:, slot].copy()
                # Quality varies by batch: the culled share is beta-distributed around the category's rate.
                culled = rng_handling.binomial(got, rng_handling.beta(cull_a, cull_b))
                stock[rows, fresh_bucket] += got - culled
                ledger["receipts"][:, d] = got
                ledger["handling_loss"][:, d] = culled
                on_order -= closing[:, slot]
                arriving[:, slot] = 0
                closing[:, slot] = 0
            if topup_hour is not None and h == TOPUP_ARRIVAL_HOUR and arriving_pm.any():
                culled = rng_handling.binomial(arriving_pm, rng_handling.beta(cull_a, cull_b))
                stock[rows, fresh_bucket] += arriving_pm - culled
                ledger["receipts"][:, d] += arriving_pm
                ledger["handling_loss"][:, d] += culled
                ledger["expedited"][:, d] += arriving_pm
                arriving_pm[:] = 0
            stock, sold = consume_fifo(stock, demand_h[:, d, h])
            left = stock.sum(axis=1)
            sales_h[:, d, h] = sold
            on_hand_h[:, d, h] = left
            oos_h[:, d, h] = left == 0
            if topup_hour is not None and h == topup_hour:
                state = State(d, h, left, on_order.copy(), history, pre, weekday, params, promo,
                              sales_h[:, d, :h + 1].sum(axis=1))
                qty = np.maximum(np.asarray(policy.topup(state), dtype=np.int64), 0)
                missed = rng_supply.random(n) < TOPUP_P_MISS
                short = rng_supply.random(n) < TOPUP_P_SHORT
                share = rng_supply.uniform(SHORT_FILL[0], SHORT_FILL[1], n)
                arriving_pm += np.where(missed, 0, np.where(short, np.floor(qty * share + 0.5), qty)).astype(np.int64)
                ledger["ordered"][:, d] += qty
            if h == review_hour:
                state = State(d, h, left, on_order.copy(), history, pre, weekday, params, promo,
                              sales_h[:, d, :h + 1].sum(axis=1))
                for batch in policy.orders(state):
                    order_rows.append(_place(batch, d, supply, rng_supply, arriving, closing, on_order))
                    ledger["ordered"][:, d] += batch.qty
        expired = stock[:, 0].copy()
        stock[:, :-1] = stock[:, 1:]
        stock[:, -1] = 0
        ledger["expired"][:, d] = expired
        ledger["sales"][:, d] = sales_h[:, d].sum(axis=1)
        ledger["closing"][:, d] = stock.sum(axis=1)
        ledger["on_order"][:, d] = on_order
        history[:, pre + d] = ledger["sales"][:, d]

    orders = pd.DataFrame(np.concatenate(order_rows) if order_rows else np.zeros((0, 7), dtype=np.int64),
                          columns=["series", "order_day", "supplier", "qty", "arrival_day", "delivered", "status"])
    result = RunResult(policy.name, world.dates, world.n_warmup, sales_h, oos_h, on_hand_h, ledger, orders,
                       params={"engine": f"freshpipe {__version__}", "run": run,
                               "receiving_hour": receive_hour, "review_hour": review_hour})
    check_invariants(result, world)
    return result


def _place(batch: OrderBatch, day: int, supply: SupplyModel, rng: np.random.Generator,
           arriving: np.ndarray, closing: np.ndarray, on_order: np.ndarray) -> np.ndarray:
    """Book an order batch: sample each delivery and schedule it. Returns the order-log rows."""
    lead, p_late, p_late2, p_miss, p_short = supply.terms(day, batch.supplier)
    n = batch.qty.size
    u_miss, u_delay, u_short = rng.random(n), rng.random(n), rng.random(n)
    share = rng.uniform(SHORT_FILL[0], SHORT_FILL[1], n)
    delay = np.where(u_delay < p_late2, 2, np.where(u_delay < p_late2 + p_late, 1, 0))
    missed = u_miss < p_miss
    filled = np.where(u_short < p_short, np.floor(batch.qty * share + 0.5), batch.qty).astype(np.int64)
    delivered = np.where(missed, 0, filled)
    arrival = day + lead + delay
    close = np.where(missed, day + lead, arrival)          # a missed order is written off on its due day
    placed = batch.qty > 0
    idx = np.flatnonzero(placed)
    if np.any(arrival[idx] - day >= RING):
        raise ValueError("delivery beyond the tracking ring; increase RING")
    np.add.at(arriving, (idx, arrival[idx] % RING), delivered[idx])
    np.add.at(closing, (idx, close[idx] % RING), batch.qty[idx])
    on_order += batch.qty
    status = np.where(missed, STATUS_MISSED, np.where(delay > 0, STATUS_LATE, STATUS_ON_TIME))
    return np.column_stack([idx, np.full(idx.size, day), batch.supplier[idx], batch.qty[idx],
                            np.where(missed[idx], -1, arrival[idx]), delivered[idx], status[idx]])


def check_invariants(result: RunResult, world: World) -> None:
    """Raise AssertionError if the ledger breaks a stock-flow identity (plan §9)."""
    led = result.daily
    waste = led["handling_loss"] + led["expired"]
    if not np.array_equal(led["opening"] + led["receipts"] - led["sales"] - waste, led["closing"]):
        raise AssertionError("opening + receipts - sales - waste != closing")
    if not np.array_equal(led["opening"][:, 1:], led["closing"][:, :-1]):
        raise AssertionError("opening stock differs from the previous day's closing stock")
    if np.any(result.sales_h > world.demand_h):
        raise AssertionError("sales exceed demand")
    if np.any(result.on_hand_h < 0) or np.any(led["closing"] < 0):
        raise AssertionError("negative stock")
    if not np.array_equal(result.oos_h, result.on_hand_h == 0):
        raise AssertionError("stock flags disagree with on-hand stock")


# --- Tables and persistence ----------------------------------------------------------------------------------------

def daily_table(result: RunResult, world: World) -> pd.DataFrame:
    """One row per series-day of the horizon: demand, the ledger and the stockout statistics."""
    h = result.horizon
    n = world.n_series
    days = result.dates[h]
    oos = result.oos_h[:, h]
    count = oos[:, :, TRADING_HOURS].sum(axis=2)
    first = first_stockout_hour(oos.reshape(-1, HOURS)).reshape(n, -1)
    demand = world.demand[:, h]
    led = {k: v[:, h] for k, v in result.daily.items()}
    frame = pd.DataFrame({
        "series": np.repeat(np.arange(n), days.size),
        "store_id": np.repeat(np.array([s.split("__")[0] for s in series_ids()]), days.size),
        "sku_id": np.repeat(np.array([s.split("__")[1] for s in series_ids()]), days.size),
        "date": np.tile(days.values, n),
        "true_demand": demand.ravel(),
        "recorded_sales": led["sales"].ravel(),
        "lost_sales": (demand - led["sales"]).ravel(),
        "opening": led["opening"].ravel(),
        "receipts": led["receipts"].ravel(),
        "handling_loss": led["handling_loss"].ravel(),
        "expired": led["expired"].ravel(),
        "waste": (led["handling_loss"] + led["expired"]).ravel(),
        "closing": led["closing"].ravel(),
        "ordered": led["ordered"].ravel(),
        "on_order": led["on_order"].ravel(),
        "stockout_hours": count.ravel().astype(np.int8),
        "all_day_outage": (count == N_TRADING_HOURS).ravel(),
        "first_stockout_hour": first.ravel().astype(np.int8),
        "promo_depth": world.promo_by_series[:, h].ravel(),
        "event_kind": world.event_kind[:, h].ravel(),
    })
    return frame


def save_run(result: RunResult, world: World, folder: Path | None = None) -> Path:
    """Write the horizon part of a run to data/synthetic/ (gitignored)."""
    folder = folder or repo_path("synthetic")
    folder.mkdir(parents=True, exist_ok=True)
    name = result.policy.lower()
    h = result.horizon
    daily_table(result, world).to_parquet(folder / f"{name}_daily.parquet", index=False)
    np.savez_compressed(folder / f"{name}_hourly.npz", sales_h=result.sales_h[:, h].astype(np.int16),
                        oos_h=result.oos_h[:, h], on_hand_h=result.on_hand_h[:, h])
    orders = result.orders.copy()
    orders["order_date"] = result.dates[orders["order_day"].to_numpy()]
    orders["supplier_id"] = np.array([s.id for s in suppliers()])[orders["supplier"].to_numpy()]
    orders["status"] = orders["status"].map(STATUS_NAMES)
    orders = orders.loc[orders["order_day"] >= result.n_warmup]
    orders.to_parquet(folder / f"{name}_orders.parquet", index=False)
    manifest = {"policy": result.policy, "seed": world.seed, "params": result.params,
                "first_day": str(result.dates[h][0].date()), "last_day": str(result.dates[-1].date()),
                "checksums": {"sales_h": checksum(result.sales_h[:, h].astype(np.int16)),
                              "oos_h": checksum(result.oos_h[:, h])}}
    (folder / f"{name}_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8",
                                                  newline="\n")
    return folder

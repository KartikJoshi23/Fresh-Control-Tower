"""Exports that replace the last fixtures (P4-06): hero series files, the live feed, golden engine cases, meta.json.

- `series/{store}__{sku}.json` (40 hero series): daily history Jan 2025-Oct 2026 under P0 (what the legacy
  system recorded), recovered demand, the 2026 out-of-sample forecast band, and an `engine` block for the
  browser's scenario engine, planned from 11 Feb 2026 (one week before Ramadan 2026) with the P1 policy's
  stock on that morning.
- `live/feed.json`: 10-23 Mar 2026 (Ramadan, Hormuz), 2 stores × 10 SKUs, hour by hour under P3, with alerts and
  purchase orders. Labelled SIMULATED FEED: it is a replay, not live data.
- `web/tests/fixtures/golden/engine_cases.json`: test-only parity cases for Part 7 (never shipped).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import engine_reference
from .backtest import Context, run_policy
from .optimise import COMPATIBLE, DISPOSAL_AED_PER_KG, GOODWILL_SHARE_OF_PRICE, HOLDING_SHARE_PER_DAY, CostModel
from .simulate import TOPUP_ARRIVAL_HOUR
from .world import HERO_SKUS, HERO_STORES, SKUS, STORES, shelf_life_days, suppliers

SERIES_FROM = "2025-01-01"
PLANNING_START = "2026-02-11"
PLANNING_DAYS = 35
LIVE_WINDOW = ("2026-03-10", "2026-03-23")
LIVE_STORES = ("dxb-marina", "dxb-deira")
MIN_REMAINING_DAYS = 1
AUTO_APPROVAL_FACTOR = 1.5      # an order above 1.5 × expected demand over its cover needs a person's approval


def _series_index(store: str, sku: str) -> int:
    return [s.id for s in STORES].index(store) * len(SKUS) + [k.id for k in SKUS].index(sku)


def _profile(p: np.ndarray) -> list[float]:
    v = np.round(p / p.sum(), 6)
    v[int(np.argmax(v))] += round(1.0 - float(v.sum()), 6)
    return v.tolist()


def _r(x: float, nd: int = 2) -> float:
    return round(float(x), nd)


def series_bodies(ctx: Context, p0_daily: pd.DataFrame, recovered: np.ndarray, profiles: dict[str, np.ndarray]) -> list[dict]:
    """Bodies for the 40 hero series files (contract: series.ts, SeriesFile)."""
    w = ctx.world
    dates = w.dates[w.horizon]
    first = int(np.searchsorted(dates, pd.Timestamp(SERIES_FROM)))
    test_start = int(np.searchsorted(dates, pd.Timestamp(ctx.config["splits"]["test_start"])))
    plan0 = int(np.searchsorted(dates, pd.Timestamp(PLANNING_START)))
    cost = CostModel.from_catalog(ctx.catalog, w.series_sku)
    sub, p1 = run_policy("P1", ctx, "2026-01-01", "2026-10-31", 0)
    origin_sub = int(np.searchsorted(sub.dates, pd.Timestamp(PLANNING_START))) - 1
    sup_ids = [s.id for s in suppliers()]
    terms = {s.id: s.normal for s in suppliers()}
    by_series = {k: g for k, g in p0_daily.groupby("series")}
    out = []
    for store in HERO_STORES:
        for sku_id in HERO_SKUS:
            i = _series_index(store, sku_id)
            sku = SKUS[[k.id for k in SKUS].index(sku_id)]
            g = by_series[i].reset_index(drop=True)
            rows = []
            for t in range(first, len(dates)):
                r = g.iloc[t]
                fc = ctx.fc[0, :, i, t] if t >= test_start else (np.nan, np.nan, np.nan)
                has_fc = not np.isnan(fc).any()
                rows.append({"date": str(dates[t].date()), "trueDemand": int(r["true_demand"]),
                             "recordedSales": int(r["recorded_sales"]), "recoveredDemand": _r(recovered[i, t]),
                             "fcP10": _r(fc[0]) if has_fc else None, "fcP50": _r(fc[1]) if has_fc else None,
                             "fcP90": _r(fc[2]) if has_fc else None, "stockoutHours": int(r["stockout_hours"]),
                             "receipts": int(r["receipts"]), "waste": int(r["waste"]), "onHandClose": int(r["closing"]),
                             "lostSales": int(r["lost_sales"]), "promo": bool(r["promo_depth"] > 0)})
            quant = []
            for j in range(PLANNING_DAYS):
                t = plan0 + j
                b = 0 if j < 7 else (1 if j < 14 else 2)
                p10, p50, p90 = sorted(float(x) for x in ctx.fc[b, :, i, t])
                quant.append({"date": str(dates[t].date()), "p10": _r(p10, 3), "p50": _r(p50, 3), "p90": _r(p90, 3)})
            options = [sku.supplier_id] + [s for s in COMPATIBLE[sku.category_id] if s != sku.supplier_id]
            lead = [{"supplierId": s, "meanDays": _r(terms[s].delay_moments()[0], 4),
                     "sdDays": _r(terms[s].delay_moments()[1], 4)} for s in options]
            o = p1.orders
            pending = o.loc[(o["series"] == i) & (o["order_day"] <= origin_sub) & (o["arrival_day"] > origin_sub)
                            & (o["delivered"] > 0)]
            life = shelf_life_days(sku)
            out.append({
                "storeId": store, "skuId": sku_id, "rows": rows,
                "engine": {
                    "planningStart": PLANNING_START, "horizonQuantiles": quant, "leadTimes": lead,
                    "shelfLifeDays": life, "minRemainingShelfLifeDays": min(MIN_REMAINING_DAYS, life - 1),
                    "unitCostAED": float(cost.unit_cost[i]), "priceAED": float(cost.price[i]),
                    "holdingCostPerUnitDayAED": _r(HOLDING_SHARE_PER_DAY * cost.unit_cost[i], 4),
                    "wasteDisposalPerUnitAED": _r(DISPOSAL_AED_PER_KG * cost.kg_per_unit[i], 4),
                    "goodwillPerUnitAED": _r(GOODWILL_SHARE_OF_PRICE * cost.price[i], 4),
                    "reviewPeriodDays": 1, "casePack": sku.case_pack,
                    "intradayProfile": _profile(profiles["normal"][i]), "ramadanProfile": _profile(profiles["special"][i]),
                    "optimalTau": float(ctx.tau[i]), "initialOnHand": int(p1.daily["closing"][i, origin_sub]),
                    "onOrder": [{"arrivalDate": str(sub.dates[int(a)].date()), "qty": int(q), "supplierId": sup_ids[int(s)]}
                                for a, q, s in zip(pending["arrival_day"], pending["delivered"], pending["supplier"])],
                }})
    return out


def live_feed_body(ctx: Context) -> dict[str, object]:
    """The live/feed.json body (contract: live.ts, LiveFeedFile), replayed from the P3 run."""
    sub, run = run_policy("P3", ctx, "2026-01-01", "2026-10-31", 0)
    days = np.flatnonzero((sub.dates >= pd.Timestamp(LIVE_WINDOW[0])) & (sub.dates <= pd.Timestamp(LIVE_WINDOW[1])))
    h0 = ctx.h_index("2026-01-01") - 28
    sup_ids = [s.id for s in suppliers()]
    led = run.daily
    ticks, events, pos = [], [], []
    stamp = lambda d, h: f"{sub.dates[d].date()}T{h:02d}:00"  # noqa: E731
    events.append({"t": stamp(days[0], 0), "storeId": None, "skuId": None, "kind": "disruption", "severity": "critical",
                   "message": "Hormuz 2026: sea and air imports are arriving late, short or not at all (orders 1 Mar-31 May).",
                   "poId": None})
    series = [_series_index(s, k) for s in LIVE_STORES for k in HERO_SKUS]
    for i in series:
        store, sku = STORES[i // len(SKUS)].id, SKUS[i % len(SKUS)].id
        for d in days:
            p50 = float(np.nan_to_num(ctx.fc[0, 1, i, h0 + d]))
            rate = p50 / 16.0
            topup = int(led["expedited"][i, d])
            morning = int(led["receipts"][i, d]) - topup
            risk_sent = out_sent = False
            for h in range(24):
                on_hand = int(run.on_hand_h[i, d, h])
                receipts = morning if h == 6 else (topup if h == TOPUP_ARRIVAL_HOUR else 0)
                waste = int(led["handling_loss"][i, d]) if h == 6 else (int(led["expired"][i, d]) if h == 23 else 0)
                cover = round(on_hand / rate, 1) if rate > 0 else None
                if on_hand == 0:
                    status = "stockout"
                elif led["expired"][i, d] > 0 and h >= 18:
                    status = "expiring"
                elif cover is not None and cover < 4 and 6 <= h <= 21:
                    status = "at_risk"
                else:
                    status = "in_stock"
                ticks.append({"t": stamp(d, h), "storeId": store, "skuId": sku, "onHand": on_hand,
                              "sales": int(run.sales_h[i, d, h]), "receipts": receipts, "waste": waste,
                              "coverHours": cover, "status": status})
                if 6 <= h <= 21 and status == "at_risk" and not risk_sent and not out_sent:
                    risk_sent = True
                    events.append({"t": stamp(d, h), "storeId": store, "skuId": sku, "kind": "stockout_risk",
                                   "severity": "warning", "message": f"{sku}: about {cover:.0f} h of cover left at the forecast rate.",
                                   "poId": None})
                if 6 <= h <= 21 and status == "stockout" and not out_sent:
                    out_sent = True
                    events.append({"t": stamp(d, h), "storeId": store, "skuId": sku, "kind": "stockout", "severity": "critical",
                                   "message": f"{sku} is out of stock.", "poId": None})
            if led["expired"][i, d] > 0:
                events.append({"t": stamp(d, 20), "storeId": store, "skuId": sku, "kind": "expiring", "severity": "serious",
                               "message": f"{int(led['expired'][i, d])} units of {sku} expire tonight.", "poId": None})
            if topup > 0:
                po = f"tu-{store}-{sku}-{sub.dates[d].date()}"
                pos.append({"id": po, "createdAt": stamp(d, 12), "supplierId": "uae-wholesale-market", "storeId": store,
                            "skuId": sku, "qty": topup, "etaAt": stamp(d, TOPUP_ARRIVAL_HOUR), "approval": "auto",
                            "reason": "Noon top-up: the morning's sales point to a shortfall before tomorrow's delivery."})
                events.append({"t": stamp(d, 12), "storeId": store, "skuId": sku, "kind": "po_created", "severity": "good",
                               "message": f"Top-up of {topup} units ordered for 16:00.", "poId": po})
    # Nightly purchase orders for the same series, placed inside the window.
    o = run.orders
    o = o.loc[o["series"].isin(series) & o["order_day"].isin(days)]
    for r in o.itertuples(index=False):
        i, d = int(r.series), int(r.order_day)
        store, sku = STORES[i // len(SKUS)].id, SKUS[i % len(SKUS)].id
        nominal = suppliers()[int(r.supplier)].normal.lead_time_days
        due = int(r.arrival_day) if r.arrival_day >= 0 else d + nominal     # a missed order was due then
        expected = float(np.nan_to_num(ctx.fc[0, 1, i, h0 + d + 1])) * max(due - d, 1)
        approval = "auto" if r.qty <= AUTO_APPROVAL_FACTOR * max(expected, 1.0) else "needs_approval"
        po = f"po-{store}-{sku}-{sub.dates[d].date()}"
        eta_day = min(due, len(sub.dates) - 1)
        pos.append({"id": po, "createdAt": stamp(d, 22), "supplierId": sup_ids[int(r.supplier)], "storeId": store,
                    "skuId": sku, "qty": int(r.qty), "etaAt": stamp(eta_day, 6), "approval": approval,
                    "reason": f"Order-up-to at the SKU's service quantile (τ = {ctx.tau[i]:.2f})."})
        events.append({"t": stamp(d, 22), "storeId": store, "skuId": sku, "kind": "po_created",
                       "severity": "good" if approval == "auto" else "warning",
                       "message": f"Order of {int(r.qty)} units ({'auto' if approval == 'auto' else 'needs approval'}).",
                       "poId": po})
        if r.arrival_day >= 0 and int(r.arrival_day) in set(days.tolist()):
            events.append({"t": stamp(int(r.arrival_day), 6), "storeId": store, "skuId": sku, "kind": "po_received",
                           "severity": "good", "message": f"{int(r.delivered)} of {int(r.qty)} units received.", "poId": po})
    # Store-level surge signal (P3-05): sales by noon well above forecast.
    for store in LIVE_STORES:
        rows = [i for i in series if STORES[i // len(SKUS)].id == store]
        for d in days:
            sold = float(run.sales_h[rows, d, :12].sum())
            expected = float(sum(np.nan_to_num(ctx.fc[0, 1, i, h0 + d]) * ctx.profile[i, h0 + d, :12].sum() for i in rows))
            if expected > 0 and sold / expected >= 1.3:
                events.append({"t": stamp(d, 12), "storeId": store, "skuId": None, "kind": "spike_detected",
                               "severity": "warning", "message": f"Store sales running {sold / expected:.1f}x the forecast by noon.",
                               "poId": None})
    events.sort(key=lambda e: e["t"])
    return {"timezone": "Asia/Dubai", "window": {"start": f"{LIVE_WINDOW[0]}T00:00", "end": f"{LIVE_WINDOW[1]}T23:00"},
            "storeIds": list(LIVE_STORES), "skuIds": list(HERO_SKUS), "ticks": ticks, "events": events,
            "purchaseOrders": pos}


def golden_body(series: list[dict]) -> dict[str, object]:
    """Golden cases on three contrasting hero series (short shelf life, sea import, bakery)."""
    pick = [s for s in series if (s["storeId"], s["skuId"]) in
            {("dxb-marina", "lettuce-romaine"), ("dxb-marina", "bananas-1kg"), ("auh-reem", "khubz-arabic")}]
    return engine_reference.golden_cases(pick)

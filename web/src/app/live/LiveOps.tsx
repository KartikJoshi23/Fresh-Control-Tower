"use client";

/**
 * Live Ops (plan §6.1 page 4): a REPLAY of a simulated hourly feed (live/feed.json, 10–23 Mar 2026, two stores ×
 * ten SKUs under the P3 policy). Nothing here is real-time data: the clock is simulated and labelled so.
 * Serves R3 (intraday response), R6 (human-in-the-loop approvals) and KQ3.
 */
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChartFrame, ENTITY_COLOR, otherSeriesColor, TableView, useSeriesFilter } from "@/components/charts/primitives";
import { TimeChart } from "@/components/charts/svg/charts";
import { Select, Toggle } from "@/components/ui/controls";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { KpiTile } from "@/components/ui/KpiTile";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { SHELF_STATUS, StatusBadge } from "@/components/ui/StatusBadge";
import type { BacktestFile, CatalogFile, LiveFeedFile, McdmFile } from "@/lib/contracts";
import { useArtefact } from "@/lib/data/hooks";
import { change, fmtDate, fmtDayMonth, fmtInt, fmtWeekdayDate } from "@/lib/format";
import { policyName } from "@/lib/labels";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

type Tick = LiveFeedFile["ticks"][number];
type Po = LiveFeedFile["purchaseOrders"][number];

const SPEEDS = [
  { value: "60", label: "1 hour per second" },
  { value: "240", label: "4 hours per second" },
  { value: "720", label: "12 hours per second" },
] as const;

const EVENT_LABEL: Record<LiveFeedFile["events"][number]["kind"], string> = {
  stockout_risk: "Stockout risk", stockout: "Stockout", spike_detected: "Spike detected", expiring: "Expiring",
  po_created: "Order placed", po_received: "Order received", disruption: "Disruption",
};

/** Hours until the shelf runs empty → sequential tint (darker = sooner). Bins are labelled in the legend. */
const COVER_BINS = [
  { max: 6, label: "Under 6 hours", color: "var(--seq-700)" },
  { max: 12, label: "6 to 12 hours", color: "var(--seq-600)" },
  { max: 24, label: "12 to 24 hours", color: "var(--seq-500)" },
  { max: 48, label: "1 to 2 days", color: "var(--seq-400)" },
  { max: Infinity, label: "2 days or more", color: "var(--seq-300)" },
];

/** "10/03 06:00" for an hourly timestamp. */
const dayHour = (t: string) => `${fmtDayMonth(t)} ${t.slice(11, 16)}`;

/** Alert messages from the feed, with the planning shorthand spelled out. */
export const plainMessage = (m: string) => m.replace(/(\d+(?:\.\d+)?) h of cover left at the forecast rate/, "$1 hours of stock left at the expected sales rate")
  .replace(/\(auto\)/, "(approved automatically)").replace(/\(needs approval\)/, "(waiting for approval)");

/** The order reasons in the feed, in plain words. */
export function plainReason(reason: string): string {
  const tau = /τ = ([\d.]+)/.exec(reason);
  if (reason.startsWith("Order-up-to") && tau) return `Daily order: refills the shelf to the AI's target level (stock-level setting ${Math.round(Number(tau[1]) * 100)}%).`;
  if (reason.startsWith("Noon top-up")) return "Midday top-up: the morning's sales show the shelf will run out before tomorrow's delivery.";
  return reason;
}
const coverBin = (h: number | null) => COVER_BINS.find((b) => (h ?? 0) < b.max) ?? COVER_BINS[4];

export function useFeedIndex(feed: LiveFeedFile) {
  return useMemo(() => {
    const hours = [...new Set(feed.ticks.map((t) => t.t))].sort();
    const at = new Map<string, Tick>();
    for (const t of feed.ticks) at.set(`${t.t}|${t.storeId}|${t.skuId}`, t);
    const events = [...feed.events].sort((a, b) => a.t.localeCompare(b.t));
    const pos = [...feed.purchaseOrders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { hours, at, events, pos };
  }, [feed]);
}

export type ApprovalMode = "auto" | "exceptions" | "manual";

/**
 * Effective approval of a purchase order (plan §6.1: Auto within guardrails / Approve exceptions / Manual).
 * The feed flags orders outside the guardrails as `needs_approval`; routine orders are `auto`.
 */
export function approvalOf(po: Po, mode: ApprovalMode, decisions: Record<string, "approved" | "rejected">) {
  if (decisions[po.id]) return decisions[po.id];
  if (mode === "manual") return "needs_approval";
  if (po.approval === "needs_approval") return mode === "auto" ? "blocked" : "needs_approval";
  return po.approval;
}

function useClock(n: number, speed: number) {
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const acc = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      acc.current += (speed / 60) * 0.25;
      const step = Math.floor(acc.current);
      if (step > 0) {
        acc.current -= step;
        setHour((h) => {
          const next = Math.min(n - 1, h + step);
          if (next === n - 1) setPlaying(false);
          return next;
        });
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, speed, n]);
  return { hour, setHour, playing, setPlaying };
}

function Live({ feed, catalog, backtest, mcdm }: { feed: LiveFeedFile; catalog: CatalogFile; backtest: BacktestFile; mcdm: McdmFile }) {
  const scenario = useScenario();
  const set = useScenarioStore((s) => s.set);
  const { hours, at, events, pos } = useFeedIndex(feed);
  const { hour, setHour, playing, setPlaying } = useClock(hours.length, scenario.ui.liveSpeed);
  const [mode, setMode] = useState<"status" | "cover">("status");
  const [onlySerious, setOnlySerious] = useState(false);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("exceptions");
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>({});
  const [focus, setFocus] = useState<{ storeId: string; skuId: string }>({ storeId: feed.storeIds[0], skuId: feed.skuIds[0] });
  const flowFilter = useSeriesFilter();
  const supplier = (id: string) => (mcdm.suppliers.find((s) => s.id === id)?.name ?? id).replace(" (fictional)", "");
  const now = hours[hour];
  const store = (id: string) => catalog.stores.find((s) => s.id === id)?.name ?? id;
  const sku = (id: string) => catalog.skus.find((s) => s.id === id)?.name ?? id;
  const cells = feed.storeIds.flatMap((st) => feed.skuIds.map((sk) => at.get(`${now}|${st}|${sk}`)).filter((t): t is Tick => !!t));
  const count = (s: Tick["status"]) => cells.filter((c) => c.status === s).length;
  const past = events.filter((e) => e.t <= now && e.kind !== "po_created" && e.kind !== "po_received"
    && (!onlySerious || e.severity === "serious" || e.severity === "critical"));
  const placed = pos.filter((p) => p.createdAt <= now);
  const pending = placed.filter((p) => approvalOf(p, approvalMode, decisions) === "needs_approval");
  const topups = placed.filter((p) => p.id.startsWith("tu-"));
  const hist = hours.slice(0, hour + 1);
  const focusTicks = hist.map((h) => at.get(`${h}|${focus.storeId}|${focus.skuId}`));
  const kpi = (policy: string) => backtest.results.find((r) => r.windowId === "hormuz" && r.policyId === policy)?.kpis;
  const p1 = kpi("P1");
  const p2 = kpi("P2");
  const decide = (id: string, d: "approved" | "rejected") => setDecisions((x) => ({ ...x, [id]: d }));

  return (
    <>
      <GlassPanel variant="deco" className="col-span-12 p-4 flex flex-wrap items-center gap-4" data-testid="live-clock">
        <div className="flex items-center gap-2">
          <button type="button" className="icon-button" aria-label="Back one hour" onClick={() => setHour((h) => Math.max(0, h - 1))}>
            <SkipBack aria-hidden="true" size={16} /></button>
          <button type="button" className="icon-button" aria-label={playing ? "Pause the replay" : "Play the replay"}
            aria-pressed={playing} onClick={() => setPlaying((p) => !p)} data-testid="play-button">
            {playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}</button>
          <button type="button" className="icon-button" aria-label="Forward one hour" onClick={() => setHour((h) => Math.min(hours.length - 1, h + 1))}>
            <SkipForward aria-hidden="true" size={16} /></button>
        </div>
        <p className="text-ink text-lg tabular-nums" aria-live="polite" data-testid="sim-time">
          {fmtWeekdayDate(now)} · {now.slice(11, 16)} Gulf time
        </p>
        <label className="flex items-center gap-2 grow min-w-[200px] text-sm text-ink-secondary">
          <span className="sr-only">Simulated time</span>
          <input type="range" className="range grow" min={0} max={hours.length - 1} value={hour} aria-label="Simulated time"
            aria-valuetext={`${fmtDate(now)} ${now.slice(11, 16)}`} onChange={(e) => setHour(Number(e.target.value))}
            style={{ "--fill": `${(hour / Math.max(1, hours.length - 1)) * 100}%` } as React.CSSProperties} />
        </label>
        <div className="w-[200px]">
          <Select label="Replay speed" value={String(scenario.ui.liveSpeed) as (typeof SPEEDS)[number]["value"]} options={SPEEDS}
            onChange={(v) => set("ui.liveSpeed", Number(v))} />
        </div>
        <ProvenanceChip provenance="SIMULATED_FEED" />
      </GlassPanel>

      <div className="col-span-12 kpi-row" role="list" aria-label="Shelf status now">
        <div role="listitem"><KpiTile label="Shelves in stock" value={`${count("in_stock")} of ${cells.length}`} provenance="SIMULATED_FEED" /></div>
        <div role="listitem"><KpiTile label="At risk or expiring" value={fmtInt(count("at_risk") + count("expiring"))} provenance="SIMULATED_FEED" /></div>
        <div role="listitem"><KpiTile label="Out of stock now" value={fmtInt(count("stockout"))} provenance="SIMULATED_FEED" /></div>
        <div role="listitem"><KpiTile label="Orders waiting for approval" value={fmtInt(pending.length)} provenance="SIMULATED_FEED" /></div>
      </div>

      <div className="col-span-12 xl:col-span-8">
        <ChartFrame title="Shelves right now" subtitle="Two stores × ten items at the replay time. Click a shelf to follow it in the chart below."
          provenance="SIMULATED_FEED"
          legend={mode === "cover" ? COVER_BINS.map((b) => ({ label: b.label, color: b.color, style: "bar" as const })) : undefined}
          note={mode === "status"
            ? <>Each shelf shows whether it is in stock, at risk of running out, close to its expiry date, or empty, and how many units are on it.</>
            : <>Each shelf shows roughly how long its stock will last at the current rate of sales. Darker means it runs out sooner.</>}
          table={<TableView caption="Shelves right now" rows={cells} columns={[{ key: "s", label: "Store", value: (c) => store(c.storeId) },
            { key: "k", label: "Item", value: (c) => sku(c.skuId) }, { key: "st", label: "Status", value: (c) => c.status.replace("_", " ") },
            { key: "o", label: "Units on the shelf", value: (c) => c.onHand, numeric: true }, { key: "c", label: "Hours until empty", value: (c) => c.coverHours ?? "–", numeric: true }]} />}>
          <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Grid mode">
            {(["status", "cover"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className="preset" onClick={() => setMode(m)}>
                {m === "status" ? "Status" : "Hours until empty"}</button>
            ))}
          </div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Table (scrolls if wide)">
            <table className="shelf-grid" data-testid="shelf-grid">
              <thead><tr><th scope="col">Item</th>{feed.storeIds.map((s) => <th key={s} scope="col">{store(s)}</th>)}</tr></thead>
              <tbody>{feed.skuIds.map((sk) => (
                <tr key={sk}><th scope="row">{sku(sk)}</th>
                  {feed.storeIds.map((st) => {
                    const c = at.get(`${now}|${st}|${sk}`);
                    if (!c) return <td key={st}>–</td>;
                    const selected = focus.storeId === st && focus.skuId === sk;
                    const bin = coverBin(c.coverHours);
                    return (
                      <td key={st}>
                        <button type="button" className="shelf-cell" aria-pressed={selected} data-status={c.status}
                          style={mode === "cover" ? { background: bin.color } : undefined}
                          onClick={() => setFocus({ storeId: st, skuId: sk })}>
                          {mode === "status" ? <StatusBadge status={SHELF_STATUS[c.status]} /> : <span className="text-ink">{bin.label}</span>}
                          {" "}<span className="text-ink-muted tabular-nums">{fmtInt(c.onHand)} on shelf</span>
                          <span className="sr-only">: {sku(sk)} at {store(st)}, about {c.coverHours ?? "no"} hours until empty</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </ChartFrame>
      </div>

      <GlassPanel variant="deco" className="col-span-12 xl:col-span-4 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-ink font-semibold">Alerts</h2>
          <ProvenanceChip provenance="SIMULATED_FEED" />
        </div>
        <Toggle label="Serious and critical only" checked={onlySerious} onChange={setOnlySerious} />
        <ol className="alert-list" aria-label="Alerts, newest first" data-testid="alert-list">
          {past.slice(-12).reverse().map((e, i) => (
            <li key={`${e.t}-${i}`}>
              <StatusBadge status={e.severity} label={EVENT_LABEL[e.kind]} />
              <span className="text-ink-muted text-xs tabular-nums">{dayHour(e.t)}</span>
              <p className="text-ink-secondary text-sm">{e.storeId ? `${store(e.storeId)}: ` : ""}{plainMessage(e.skuId ? e.message.replaceAll(e.skuId, sku(e.skuId)) : e.message)}</p>
            </li>
          ))}
          {past.length === 0 ? <li className="text-ink-muted text-sm">No alerts yet.</li> : null}
        </ol>
      </GlassPanel>

      <div className="col-span-12 xl:col-span-7">
        <ChartFrame title={`${sku(focus.skuId)} at ${store(focus.storeId)}, hour by hour`} subtitle="From the start of the replay up to the replay time"
          provenance="SIMULATED_FEED" filter={flowFilter}
          legend={[{ id: "oh", label: "Units on the shelf", color: otherSeriesColor(0) }, { id: "s", label: "Units sold in the hour", color: ENTITY_COLOR.ai },
            { id: "r", label: "Units delivered", color: otherSeriesColor(1), style: "dashed" }]}
          note={<>Stock on the shelf jumps up when a delivery arrives and falls as it sells. If it reaches zero, sales stop until the next delivery.</>}
          table={<TableView caption="Units per hour" rows={focusTicks.filter((t): t is Tick => !!t).slice(-48)} columns={[{ key: "t", label: "Date and hour", value: (t) => `${fmtDate(t.t)} ${t.t.slice(11, 16)}` },
            { key: "o", label: "Units on the shelf", value: (t) => t.onHand, numeric: true }, { key: "s", label: "Units sold", value: (t) => t.sales, numeric: true },
            { key: "r", label: "Units delivered", value: (t) => t.receipts, numeric: true }, { key: "w", label: "Units thrown away", value: (t) => t.waste, numeric: true }]} />}>
          {hist.length > 1 ? (
            <TimeChart dates={hist} height={260} ariaLabel="Hourly stock on the shelf, sales and deliveries for the selected shelf" yLabel="Units"
              series={[
                { id: "oh", label: "Units on the shelf", color: otherSeriesColor(0), values: focusTicks.map((t) => t?.onHand ?? null) },
                { id: "s", label: "Units sold", color: ENTITY_COLOR.ai, values: focusTicks.map((t) => t?.sales ?? null) },
                { id: "r", label: "Units delivered", color: otherSeriesColor(1), values: focusTicks.map((t) => t?.receipts ?? null), dashed: true },
              ].filter((x) => flowFilter.isShown(x.id))} />
          ) : <p className="text-ink-muted">Press play, or drag the time slider, to build the history.</p>}
        </ChartFrame>
      </div>

      <GlassPanel variant="deco" className="col-span-12 xl:col-span-5 p-4 flex flex-col gap-3" data-testid="topup-counter">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-ink font-semibold">What the midday top-up adds</h2>
          <ProvenanceChip provenance="PRECOMPUTED" />
        </div>
        <p className="text-ink-secondary text-sm">
          At noon the AI checks the morning&apos;s sales. If the shelf will not last until tomorrow&apos;s delivery, it orders a top-up from
          the UAE wholesale market that arrives around 16:00 (it costs 25% more per unit).
        </p>
        <p className="text-ink"><span className="stat-value">{fmtInt(topups.length)}</span> top-ups so far in this replay,
          {" "}{fmtInt(topups.reduce((s, p) => s + p.qty, 0))} units in total.</p>
        {p1 && p2 ? (
          <p className="text-ink-secondary text-sm">
            In the simulated Hormuz 2026 disruption (typical result of {backtest.results[0].runs} runs), &ldquo;{policyName("P2")}&rdquo; has{" "}
            <strong className="text-ink">{Math.abs(change(p2.lostSalesUnits.p50, p1.lostSalesUnits.p50)).toFixed(0)}% {p2.lostSalesUnits.p50 <= p1.lostSalesUnits.p50 ? "fewer" : "more"} missed sales</strong> and a{" "}
            <strong className="text-ink">{Math.abs(change(p2.totalCostAED.p50, p1.totalCostAED.p50)).toFixed(0)}% {p2.totalCostAED.p50 <= p1.totalCostAED.p50 ? "lower" : "higher"} total cost</strong> than
            &ldquo;{policyName("P1")}&rdquo; alone. That result tests two same-day steps together: this noon top-up, and a larger
            evening order when a store&apos;s sales run well above the forecast.
          </p>
        ) : null}
      </GlassPanel>

      <div className="col-span-12">
        <ChartFrame title="Purchase orders" subtitle="Newest first. Routine orders within the agreed limits go through on their own; the approval setting decides what happens to unusual ones."
          provenance="SIMULATED_FEED"
          table={<TableView caption="Purchase orders so far" rows={placed.slice(-40).reverse()} columns={[{ key: "t", label: "Placed", value: (p) => `${fmtDate(p.createdAt)} ${p.createdAt.slice(11, 16)}` },
            { key: "s", label: "Store", value: (p) => store(p.storeId) }, { key: "k", label: "Item", value: (p) => sku(p.skuId) },
            { key: "q", label: "Units", value: (p) => p.qty, numeric: true }, { key: "a", label: "Approval", value: (p) => approvalOf(p, approvalMode, decisions).replace("_", " ") }]} />}>
          <div className="flex flex-wrap items-end gap-4 mb-3">
            <div className="w-[320px] max-w-full">
              <Select label="Approval setting" value={approvalMode} onChange={setApprovalMode} options={[
                { value: "auto", label: "Automatic within limits (unusual orders blocked)" }, { value: "exceptions", label: "A person approves unusual orders" },
                { value: "manual", label: "A person approves every order" }]} />
            </div>
            <p className="text-ink-muted text-sm">{fmtInt(placed.length)} orders so far · {fmtInt(pending.length)} waiting</p>
          </div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Table (scrolls if wide)">
            <table className="data-table" data-testid="po-log">
              <thead><tr><th scope="col">Placed</th><th scope="col">Store</th><th scope="col">Item</th><th scope="col" className="num">Units</th>
                <th scope="col">Supplier</th><th scope="col">Arrives</th><th scope="col">Why</th><th scope="col">Approval</th></tr></thead>
              <tbody>{placed.slice(-8).reverse().map((p) => {
                const a = approvalOf(p, approvalMode, decisions);
                return (
                  <tr key={p.id}>
                    <td className="tabular-nums">{dayHour(p.createdAt)}</td><td>{store(p.storeId)}</td><td>{sku(p.skuId)}</td>
                    <td className="num">{fmtInt(p.qty)}</td><td>{supplier(p.supplierId)}</td>
                    <td className="tabular-nums">{dayHour(p.etaAt)}</td><td className="text-ink-secondary">{plainReason(p.reason)}</td>
                    <td>{a === "needs_approval" ? (
                      <span className="flex gap-2">
                        <button type="button" className="preset" onClick={() => decide(p.id, "approved")} aria-label={`Approve order ${p.id}`}>Approve</button>
                        <button type="button" className="preset" onClick={() => decide(p.id, "rejected")} aria-label={`Reject order ${p.id}`}>Reject</button>
                      </span>
                    ) : <StatusBadge status={a === "rejected" || a === "blocked" ? "critical" : "good"}
                      label={a === "auto" ? "Approved automatically" : a === "approved" ? "Approved" : a === "blocked" ? "Blocked: outside the limits" : "Rejected"} />}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </ChartFrame>
      </div>
    </>
  );
}

export function LiveOps() {
  const feed = useArtefact("live/feed.json");
  const catalog = useArtefact("catalog.json");
  const backtest = useArtefact("backtest.json");
  const mcdm = useArtefact("mcdm.json");
  return (
    <div className="page-grid py-6">
      <PageHeader accent="lime" eyebrow="Simulated live feed · 10/03/2026 to 23/03/2026" title="Live Ops"
        description={<>A replay of a simulated hourly feed for two stores and ten items, ordered with &ldquo;{policyName("P3")}&rdquo;. The clock
          is simulated; this is how the control tower would look on a live connection.</>} />
      <DataState result={feed} what="the simulated feed" minHeight={400}>
        {(f) => (
          <DataState result={catalog} what="the catalogue">
            {(c) => <DataState result={backtest} what="the backtest">
              {(b) => <DataState result={mcdm} what="the suppliers">{(m) => <Live feed={f} catalog={c} backtest={b} mcdm={m} />}</DataState>}
            </DataState>}
          </DataState>
        )}
      </DataState>
    </div>
  );
}

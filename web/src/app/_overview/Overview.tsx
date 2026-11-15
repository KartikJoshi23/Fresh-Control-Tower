"use client";

/** Overview (plan §6.1 page 1): the board's view, recommendation first. Serves C1, KQ1, KQ4. */
import { ChartFrame, ENTITY_COLOR, TableView, useSeriesFilter } from "@/components/charts/primitives";
import { XYChart } from "@/components/charts/svg/charts";
import { HiddenDemandReveal } from "@/components/signature/HiddenDemandReveal";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { KpiTile } from "@/components/ui/KpiTile";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import type { BacktestFile, CatalogFile, FrontierFile } from "@/lib/contracts";
import { useArtefact, useSeries } from "@/lib/data/hooks";
import { inWindow, useDateWindow } from "@/lib/data/windows";
import { change, fmtAED, fmtDate, fmtKg, fmtPct, fmtSignedPct, fmtSignedPts, fmtUnits } from "@/lib/format";
import { likelyRange, POLICY_HELP, policyName, serviceTargetLabel } from "@/lib/labels";
import type { PolicyId } from "@/lib/state/scenario";
import { useScenario } from "@/lib/state/scenarioStore";

export function kpiOf(file: BacktestFile, windowId: string, policyId: string) {
  return file.results.find((r) => r.windowId === windowId && r.policyId === policyId)?.kpis ?? null;
}

function Recommendation({ file, windowId, windowLabel }: { file: BacktestFile; windowId: string; windowLabel: string }) {
  const results = file.results.filter((r) => r.windowId === windowId);
  const best = results.reduce((a, b) => (b.kpis.totalCostAED.p50 < a.kpis.totalCostAED.p50 ? b : a));
  const base = kpiOf(file, windowId, "P0");
  if (!base) return null;
  const k = best.kpis;
  return (
    <GlassPanel variant="chart" className="col-span-12 recommendation" aria-labelledby="rec-title" data-testid="recommendation">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="stat-label">Recommendation · {windowLabel}</span>
          <h2 id="rec-title" className="text-xl font-semibold text-ink">
            Switch store ordering to &ldquo;{policyName(best.policyId)}&rdquo;
          </h2>
          <p className="text-ink">{POLICY_HELP[best.policyId as PolicyId]}</p>
          <p className="text-ink-secondary max-w-4xl">
            Compared with the current ordering method, customers miss {Math.abs(change(k.lostSalesUnits.p50, base.lostSalesUnits.p50)).toFixed(0)}% fewer
            sales and the total cost of running the stock falls by {Math.abs(change(k.totalCostAED.p50, base.totalCostAED.p50)).toFixed(0)}%.
            Shelves are stocked {fmtPct(k.availabilityPct.p50)} of opening hours instead of {fmtPct(base.availabilityPct.p50)}.
            The total weight of food thrown away goes {k.wasteKg.p50 >= base.wasteKg.p50 ? "up" : "down"} by{" "}
            {Math.abs(change(k.wasteKg.p50, base.wasteKg.p50)).toFixed(0)}% because the stores now sell far more; for the same
            level of stock on the shelves, the AI throws away less (see Impact).
          </p>
        </div>
        <div className="flex gap-2">
          <ProvenanceChip provenance="PRECOMPUTED" sources={[`Typical result of ${best.runs} simulated runs`]} />
          <ProvenanceChip provenance="CALIBRATED_SYNTHETIC" />
        </div>
      </div>
    </GlassPanel>
  );
}

function KpiTiles({ file, windowId, policyId, windowLabel }: { file: BacktestFile; windowId: string; policyId: string; windowLabel: string }) {
  const ai = kpiOf(file, windowId, policyId);
  const base = kpiOf(file, windowId, "P0");
  if (!ai || !base) return null;
  const range = (d: { p10: number; p90: number }, f: (v: number) => string) => likelyRange(f(d.p10), f(d.p90));
  const co2 = (v: number) => `${fmtKg(v)} CO2e`;
  const tiles = [
    { label: "Missed sales", value: fmtUnits(ai.lostSalesUnits.p50), a: ai.lostSalesUnits.p50, b: base.lostSalesUnits.p50,
      range: range(ai.lostSalesUnits, fmtUnits), lower: true },
    { label: "Food thrown away", value: fmtKg(ai.wasteKg.p50), a: ai.wasteKg.p50, b: base.wasteKg.p50, range: range(ai.wasteKg, fmtKg), lower: true },
    { label: "Total cost of stock", value: fmtAED(ai.totalCostAED.p50), a: ai.totalCostAED.p50, b: base.totalCostAED.p50,
      range: range(ai.totalCostAED, fmtAED), lower: true },
    { label: "Carbon emissions", value: co2(ai.co2eKg.p50), a: ai.co2eKg.p50, b: base.co2eKg.p50,
      range: range(ai.co2eKg, co2), lower: true },
  ];
  const availDelta = ai.availabilityPct.p50 - base.availabilityPct.p50;
  const runs = file.results.find((r) => r.windowId === windowId)?.runs ?? 0;
  return (
    <>
      <p className="col-span-12 text-ink-secondary text-sm" data-testid="kpi-caption">
        <strong className="text-ink">{policyName(policyId)}</strong> compared with the current ordering method, {windowLabel}.
        Each figure is the typical result of {runs} simulated runs; the likely range holds 8 in 10 runs. Missed sales are units customers
        wanted while the shelf was empty; shelves in stock is the share of opening hours with stock; carbon emissions come from wasted food and transport.
      </p>
      <div className="col-span-12 kpi-row" role="list" aria-label={`${policyName(policyId)} compared with the current method`}>
        {tiles.map((t) => {
          const c = change(t.a, t.b);
          return (
            <div role="listitem" key={t.label}>
              <KpiTile label={t.label} value={t.value} delta={`${fmtSignedPct(c, 0)} vs current method`} better={t.lower ? c <= 0 : c >= 0}
                range={t.range} provenance="PRECOMPUTED" />
            </div>
          );
        })}
        <div role="listitem">
          <KpiTile label="Shelves in stock" value={fmtPct(ai.availabilityPct.p50)}
            delta={`${fmtSignedPts(availDelta)} vs current method`} better={availDelta >= 0}
            range={`Current method ${fmtPct(base.availabilityPct.p50)}`} provenance="PRECOMPUTED" />
        </div>
      </div>
    </>
  );
}

function MiniFrontier({ file }: { file: FrontierFile }) {
  const filter = useSeriesFilter();
  const curves = file.curves.map((c) => ({
    id: c.policyId, label: policyName(c.policyId),
    color: c.policyId === "P0" ? ENTITY_COLOR.baseline : ENTITY_COLOR.ai,
    points: c.points.map((p) => ({ x: p.availabilityPct, y: p.wastePct, label: serviceTargetLabel(p.serviceTarget) })),
  }));
  const rec = file.curves.find((c) => c.policyId === file.recommended.policyId)?.points
    .reduce((a, b) => (Math.abs(b.serviceTarget - file.recommended.serviceTarget) < Math.abs(a.serviceTarget - file.recommended.serviceTarget) ? b : a));
  const recVisible = filter.isShown(file.recommended.policyId);
  return (
    <ChartFrame title="More stock on the shelves, less food wasted" subtitle="Each dot is one stock-level setting, tested on 1 Jan to 31 Oct 2026"
      provenance="PRECOMPUTED" filter={filter} legend={curves.map((c) => ({ id: c.id, label: c.label, color: c.color }))}
      note={<>Further <strong>right</strong> means shelves were stocked more of the time; further <strong>down</strong> means less food
        was thrown away. The AI&apos;s dots sit to the right of and below the current method&apos;s, so it does better on both.</>}
      table={<TableView caption="Settings tested" rows={file.curves.flatMap((c) => c.points.map((p) => ({ ...p, policy: c.policyId })))}
        columns={[{ key: "p", label: "Ordering method", value: (r) => policyName(r.policy) },
          { key: "t", label: "Stock-level setting", value: (r) => `${Math.round(r.serviceTarget * 100)}%` },
          { key: "a", label: "Shelves in stock (% of opening hours)", value: (r) => r.availabilityPct, numeric: true },
          { key: "w", label: "Waste (% of stock received)", value: (r) => r.wastePct, numeric: true }]} />}>
      <XYChart curves={curves.filter((c) => filter.isShown(c.id))} xLabel="Shelves in stock (% of opening hours)" yLabel="Waste (% of stock received)"
        height={260} ariaLabel="Waste against shelf availability for the current method and the AI" formatX={(v) => `${v}%`} formatY={(v) => `${v}%`}
        marker={rec && recVisible ? { x: rec.availabilityPct, y: rec.wastePct, label: "Recommended setting", color: "var(--ink-primary)" } : undefined} />
    </ChartFrame>
  );
}

function RevealPanel({ catalog }: { catalog: CatalogFile }) {
  const { selection } = useScenario();
  const series = useSeries(selection.storeId, selection.skuId);
  const win = useDateWindow();
  const filter = useSeriesFilter();
  const sku = catalog.skus.find((s) => s.id === selection.skuId);
  const store = catalog.stores.find((s) => s.id === selection.storeId);
  return (
    <ChartFrame title="Empty shelves hide demand" subtitle={`${store?.name ?? selection.storeId} · ${sku?.name ?? selection.skuId} · ${win.label}`}
      provenance={["CALIBRATED_SYNTHETIC", "PRECOMPUTED"]} filter={filter}
      legend={[{ id: "recorded", label: "Recorded sales (what the till sees)", color: ENTITY_COLOR.baseline },
        { id: "truth", label: "True demand (what customers wanted)", color: ENTITY_COLOR.truth },
        { id: "recovered", label: "Demand recovered by the AI", color: ENTITY_COLOR.ai, style: "dashed" },
        { label: "Missed sales", color: ENTITY_COLOR.truth, style: "band" }]}
      note={<>Units sold per day of one item in one store. When a shelf is empty, the till records fewer sales than customers wanted.
        Left of the handle you see only the till&apos;s view; to the right, the shaded gap is the demand that empty shelves hid,
        and the dashed line is how much of it the AI works out from the sales pattern.</>}
      table={<DataState result={series} what="the series">{(d) => (
        <TableView caption="Units per day" rows={inWindow(d.rows, win)} columns={[
          { key: "d", label: "Date", value: (r) => fmtDate(r.date) }, { key: "s", label: "Recorded sales (units)", value: (r) => r.recordedSales, numeric: true },
          { key: "t", label: "True demand (units)", value: (r) => r.trueDemand, numeric: true },
          { key: "r", label: "Recovered by the AI (units)", value: (r) => r.recoveredDemand, numeric: true }]} />
      )}</DataState>}>
      <DataState result={series} what="the demand series" minHeight={300}>
        {(d) => {
          const rows = inWindow(d.rows, win);
          return rows.length > 1
            ? <HiddenDemandReveal rows={rows} priceAED={sku?.priceAED ?? 0}
                show={{ recorded: filter.isShown("recorded"), truth: filter.isShown("truth"), recovered: filter.isShown("recovered") }} />
            : <p className="text-ink-muted">No days in this window.</p>;
        }}
      </DataState>
    </ChartFrame>
  );
}

export function Overview() {
  const backtest = useArtefact("backtest.json");
  const frontier = useArtefact("frontier.json");
  const catalog = useArtefact("catalog.json");
  const win = useDateWindow();
  const { policy } = useScenario();
  const policyId = policy.policy === "P0" ? "P3" : policy.policy;
  return (
    <div className="page-grid py-6">
      <PageHeader accent="violet" eyebrow="Group 1 · AI for Inventory Management" title="Fresh Control Tower"
        description={<>AI ordering for fresh groceries in the UAE: it finds the demand that empty shelves hide, plans ahead for festivals
          and sudden spikes, and picks suppliers when routes are disrupted. All figures come from a realistic simulation of a fictional
          retailer, and each chart says where its numbers come from.</>}
        aside={<><ProvenanceChip provenance="CALIBRATED_SYNTHETIC" /><ProvenanceChip provenance="PRECOMPUTED" /></>} />
      <DataState result={backtest} what="the backtest results">
        {(file) => (
          <>
            <Recommendation file={file} windowId={win.id} windowLabel={win.label} />
            <KpiTiles file={file} windowId={win.id} policyId={policyId} windowLabel={win.label} />
          </>
        )}
      </DataState>
      <div className="col-span-12 xl:col-span-8">
        <DataState result={catalog} what="the catalogue">{(c) => <RevealPanel catalog={c} />}</DataState>
      </div>
      <div className="col-span-12 xl:col-span-4">
        <DataState result={frontier} what="the frontier">{(f) => <MiniFrontier file={f} />}</DataState>
      </div>
    </div>
  );
}

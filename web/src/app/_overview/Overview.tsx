"use client";

/** Overview (plan §6.1 page 1): the board's view, recommendation first. Serves C1, KQ1, KQ4. */
import { ChartFrame, ENTITY_COLOR, TableView } from "@/components/charts/primitives";
import { XYChart } from "@/components/charts/svg/charts";
import { HiddenDemandReveal } from "@/components/signature/HiddenDemandReveal";
import { DataState } from "@/components/ui/DataState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { KpiTile } from "@/components/ui/KpiTile";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import type { BacktestFile, CatalogFile, FrontierFile } from "@/lib/contracts";
import { useArtefact, useSeries } from "@/lib/data/hooks";
import { inWindow, useDateWindow } from "@/lib/data/windows";
import { change, fmtAED, fmtInt, fmtKg, fmtPct, fmtSignedPct } from "@/lib/format";
import { useScenario } from "@/lib/state/scenarioStore";

const POLICY_LABEL: Record<string, string> = { P0: "Baseline", P1: "AI-Daily", P2: "AI-Intraday", P3: "AI-Intraday + Smart Sourcing" };

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
            Move replenishment to {best.policyId} {POLICY_LABEL[best.policyId]}
          </h2>
          <p className="text-ink-secondary max-w-4xl">
            Against the legacy rule, lost sales fall {fmtSignedPct(change(k.lostSalesUnits.p50, base.lostSalesUnits.p50), 0)} and
            total cost {fmtSignedPct(change(k.totalCostAED.p50, base.totalCostAED.p50), 0)}; availability rises from{" "}
            {fmtPct(base.availabilityPct.p50)} to {fmtPct(k.availabilityPct.p50)}. Waste in kg changes by{" "}
            {fmtSignedPct(change(k.wasteKg.p50, base.wasteKg.p50), 0)} because far more demand is served; at equal
            availability the AI wastes less (Impact page).
          </p>
        </div>
        <div className="flex gap-2">
          <ProvenanceChip provenance="PRECOMPUTED" sources={[`${best.runs} paired Monte Carlo runs, median`]} />
          <ProvenanceChip provenance="CALIBRATED_SYNTHETIC" />
        </div>
      </div>
    </GlassPanel>
  );
}

function KpiTiles({ file, windowId, policyId }: { file: BacktestFile; windowId: string; policyId: string }) {
  const ai = kpiOf(file, windowId, policyId);
  const base = kpiOf(file, windowId, "P0");
  if (!ai || !base) return null;
  const range = (d: { p10: number; p90: number }, f: (v: number) => string) => `P10–P90 ${f(d.p10)} – ${f(d.p90)}`;
  const tiles = [
    { label: "Lost sales", value: `${fmtInt(ai.lostSalesUnits.p50)} units`, a: ai.lostSalesUnits.p50, b: base.lostSalesUnits.p50,
      range: range(ai.lostSalesUnits, fmtInt), lower: true },
    { label: "Waste", value: fmtKg(ai.wasteKg.p50), a: ai.wasteKg.p50, b: base.wasteKg.p50, range: range(ai.wasteKg, fmtKg), lower: true },
    { label: "Total cost", value: fmtAED(ai.totalCostAED.p50), a: ai.totalCostAED.p50, b: base.totalCostAED.p50,
      range: range(ai.totalCostAED, fmtAED), lower: true },
    { label: "CO2e (waste + transport)", value: fmtKg(ai.co2eKg.p50), a: ai.co2eKg.p50, b: base.co2eKg.p50,
      range: range(ai.co2eKg, fmtKg), lower: true },
  ];
  const availDelta = ai.availabilityPct.p50 - base.availabilityPct.p50;
  return (
    <div className="col-span-12 kpi-row" role="list" aria-label={`${policyId} versus baseline`}>
      {tiles.map((t) => {
        const c = change(t.a, t.b);
        return (
          <div role="listitem" key={t.label}>
            <KpiTile label={t.label} value={t.value} delta={`${fmtSignedPct(c, 0)} vs baseline`} better={t.lower ? c <= 0 : c >= 0}
              range={t.range} provenance="PRECOMPUTED" />
          </div>
        );
      })}
      <div role="listitem">
        <KpiTile label="Availability (in-stock hours)" value={fmtPct(ai.availabilityPct.p50)}
          delta={`${availDelta >= 0 ? "+" : "−"}${Math.abs(availDelta).toFixed(1)} pts vs baseline`} better={availDelta >= 0}
          range={`Baseline ${fmtPct(base.availabilityPct.p50)}`} provenance="PRECOMPUTED" />
      </div>
    </div>
  );
}

function MiniFrontier({ file }: { file: FrontierFile }) {
  const curves = file.curves.map((c) => ({
    id: c.policyId, label: c.policyId === "P0" ? "Baseline (legacy rule)" : "AI (P1)",
    color: c.policyId === "P0" ? ENTITY_COLOR.baseline : ENTITY_COLOR.ai,
    points: c.points.map((p) => ({ x: p.availabilityPct, y: p.wastePct, label: `τ ${p.serviceTarget}` })),
  }));
  const rec = file.curves.find((c) => c.policyId === file.recommended.policyId)?.points
    .reduce((a, b) => (Math.abs(b.serviceTarget - file.recommended.serviceTarget) < Math.abs(a.serviceTarget - file.recommended.serviceTarget) ? b : a));
  return (
    <ChartFrame title="AI moves the waste–availability frontier" subtitle="Each point is one service setting, Jan–Oct 2026"
      provenance="PRECOMPUTED" legend={curves.map((c) => ({ label: c.label, color: c.color }))}
      table={<TableView caption="Frontier points" rows={file.curves.flatMap((c) => c.points.map((p) => ({ ...p, policy: c.policyId })))}
        columns={[{ key: "p", label: "Policy", value: (r) => r.policy }, { key: "t", label: "Service τ", value: (r) => r.serviceTarget, numeric: true },
          { key: "a", label: "Availability %", value: (r) => r.availabilityPct, numeric: true }, { key: "w", label: "Waste % of receipts", value: (r) => r.wastePct, numeric: true }]} />}>
      <XYChart curves={curves} xLabel="Availability (% of trading hours in stock)" yLabel="Waste (% of receipts)" height={240}
        ariaLabel="Waste against availability for the baseline and the AI" formatX={(v) => `${v}%`} formatY={(v) => `${v}%`}
        marker={rec ? { x: rec.availabilityPct, y: rec.wastePct, label: "Recommended", color: "var(--ink-primary)" } : undefined} />
    </ChartFrame>
  );
}

function RevealPanel({ catalog }: { catalog: CatalogFile }) {
  const { selection } = useScenario();
  const series = useSeries(selection.storeId, selection.skuId);
  const win = useDateWindow();
  const sku = catalog.skus.find((s) => s.id === selection.skuId);
  const store = catalog.stores.find((s) => s.id === selection.storeId);
  return (
    <ChartFrame title="Empty shelves hide demand" subtitle={`${store?.name ?? selection.storeId} · ${sku?.name ?? selection.skuId} · ${win.label}`}
      provenance={["CALIBRATED_SYNTHETIC", "PRECOMPUTED"]}
      legend={[{ label: "Recorded sales (legacy view)", color: ENTITY_COLOR.baseline }, { label: "True demand", color: ENTITY_COLOR.truth },
        { label: "AI recovered demand", color: ENTITY_COLOR.ai, style: "dashed" }, { label: "Hidden demand", color: ENTITY_COLOR.truth, style: "band" }]}
      table={<DataState result={series} what="the series">{(d) => (
        <TableView caption="Daily demand" rows={inWindow(d.rows, win)} columns={[
          { key: "d", label: "Date", value: (r) => r.date }, { key: "s", label: "Recorded sales", value: (r) => r.recordedSales, numeric: true },
          { key: "t", label: "True demand", value: (r) => r.trueDemand, numeric: true }, { key: "r", label: "Recovered", value: (r) => r.recoveredDemand, numeric: true }]} />
      )}</DataState>}>
      <DataState result={series} what="the demand series" minHeight={300}>
        {(d) => {
          const rows = inWindow(d.rows, win);
          return rows.length > 1 ? <HiddenDemandReveal rows={rows} priceAED={sku?.priceAED ?? 0} /> : <p className="text-ink-muted">No days in this window.</p>;
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
      <header className="col-span-12 flex flex-col gap-1">
        <p className="stat-label">Group 1 · AI for Inventory Management · fictional UAE dark-store operator</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Fresh Control Tower</h1>
        <p className="text-ink-secondary max-w-3xl">
          AI replenishment for UAE fresh grocery: recover the demand that empty shelves hide, plan for festivals and sudden spikes,
          and source under disruption. Numbers below come from the calibrated synthetic world and are labelled by provenance.
        </p>
      </header>
      <DataState result={backtest} what="the backtest results">
        {(file) => (
          <>
            <Recommendation file={file} windowId={win.id} windowLabel={win.label} />
            <KpiTiles file={file} windowId={win.id} policyId={policyId} />
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

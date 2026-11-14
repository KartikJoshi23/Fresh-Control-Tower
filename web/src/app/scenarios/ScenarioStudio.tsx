"use client";

/** Scenario Studio (plan §6.1 page 3): deep what-ifs on one hero store-SKU. Serves R1, R2, R4, R5, KQ1. */
import { ChartFrame, ENTITY_COLOR, otherSeriesColor, TableView } from "@/components/charts/primitives";
import { TimeChart } from "@/components/charts/svg/charts";
import { SurgePlanner } from "@/components/signature/SurgePlanner";
import { NumberField } from "@/components/ui/controls";
import { DataState } from "@/components/ui/DataState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { KpiTile } from "@/components/ui/KpiTile";
import type { CatalogFile, McdmFile, SeriesFile } from "@/lib/contracts";
import { useArtefact, useSeries } from "@/lib/data/hooks";
import type { EngineScenario } from "@/lib/engine/engine";
import { leadTimeMultiplier, toEngineScenario } from "@/lib/engine/scenario";
import { planSurge, type SupplierOption } from "@/lib/engine/surge";
import { useEngine } from "@/lib/engine/useEngine";
import { change, fmtAED, fmtInt, fmtShare, fmtSignedPct } from "@/lib/format";
import { activeChips } from "@/lib/state/scenario";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

const RUNS = 50;
const SURGE_LABEL = { prebuild_primary: "Pre-build with the usual supplier", switch_faster: "Switch to the fastest open supplier",
  split: "Split into two deliveries", accept_shortfall: "Accept the shortfall" } as const;

function Studio({ series, catalog, mcdm }: { series: SeriesFile; catalog: CatalogFile; mcdm: McdmFile }) {
  const scenario = useScenario();
  const set = useScenarioStore((s) => s.set);
  const engine = series.engine;
  const base = toEngineScenario(scenario, engine);
  const named: { key: string; label: string; scenario: EngineScenario }[] = [
    { key: "legacy", label: "Legacy rule (P0)", scenario: { ...base, policy: "P0" } },
    { key: "ai", label: `AI, τ ${base.tau ?? engine.optimalTau} (${base.tau === null ? "tuned on the backtest" : "your setting"})`, scenario: { ...base, policy: "AI" } },
    { key: "ai-95", label: "AI, τ 0.95 (more buffer)", scenario: { ...base, policy: "AI", tau: 0.95 } },
    ...engine.leadTimes.slice(1).map((l, i) => ({
      key: `alt-${i + 1}`, label: `AI via ${l.supplierId.replace("sup-", "")}`,
      scenario: { ...base, policy: "AI" as const, supplierIndex: i + 1, leadTimeMultiplier: leadTimeMultiplier(scenario, engine, i + 1) },
    })),
  ];
  const key = JSON.stringify([series.storeId, series.skuId, named.map((n) => n.scenario)]);
  const { result, p95, samples } = useEngine({ engine, scenarios: named.map(({ key: k, scenario: s }) => ({ key: k, scenario: s })), runs: RUNS }, key);
  const chosenKey = scenario.policy.policy === "P0" ? "legacy" : "ai";
  const dates = engine.horizonQuantiles.map((q) => q.date);
  const sku = catalog.skus.find((s) => s.id === series.skuId);
  const store = catalog.stores.find((s) => s.id === series.storeId);

  // Surge planner inputs.
  const spike = base.spike ?? { startDay: 10, days: 3, magnitude: 2.5, warningDays: 0 };
  const today = Math.max(0, spike.startDay - (spike.warningDays ?? 0));
  const extraPerDay = engine.horizonQuantiles.slice(spike.startDay, spike.startDay + spike.days)
    .reduce((a, q) => a + q.p50, 0) / Math.max(1, spike.days) * (base.demandMultiplier ?? 1) * (spike.magnitude - 1);
  const metric = (id: string, c: string) => mcdm.suppliers.find((s) => s.id === id)?.metrics[c];
  const primaryCost = metric(engine.leadTimes[0].supplierId, "landed-cost") ?? 1;
  const options: SupplierOption[] = engine.leadTimes.map((l, i) => ({
    id: l.supplierId, leadDays: Math.max(1, Math.round(l.meanDays * leadTimeMultiplier(scenario, engine, i))),
    costFactor: (metric(l.supplierId, "landed-cost") ?? primaryCost) / primaryCost, co2ePerKg: metric(l.supplierId, "carbon") ?? 0,
  }));
  const sellable = Math.max(engine.shelfLifeDays - engine.minRemainingShelfLifeDays, 1);
  const plan = planSurge({ today, spikeStart: spike.startDay, spikeDays: spike.days, extraPerDay, shelfLife: engine.shelfLifeDays,
    minRemaining: engine.minRemainingShelfLifeDays, options, unitCost: engine.unitCostAED, price: engine.priceAED, kgPerUnit: sku?.kgPerUnit ?? 1 });

  const legacy = result?.results.legacy;
  const ai = result?.results.ai;
  const det = result?.results[chosenKey]?.deterministic;
  return (
    <>
      <GlassPanel variant="deco" className="col-span-12 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-ink">{store?.name} · {sku?.name} · planning from {engine.planningStart} for {dates.length} days</p>
          <p className="text-ink-muted text-sm">Scenario: {activeChips(scenario).join(" · ") || "forecast demand, no events"}. Change it in the Scenario Console (top bar).</p>
        </div>
        <p className="text-ink-muted text-sm tabular-nums" data-testid="recompute-time">
          {result ? `Recomputed ${named.length} options × ${RUNS} runs in ${result.ms.toFixed(0)} ms · p95 ${p95.toFixed(0)} ms over ${samples}` : "Computing…"}
        </p>
      </GlassPanel>

      <div className="col-span-12 kpi-row" role="list" aria-label="AI versus the legacy rule for this scenario">
        {legacy && ai ? ([
          ["Fill rate", fmtShare(ai.mc.fillRate.p50), ai.mc.fillRate.p50 - legacy.mc.fillRate.p50, false, `Legacy ${fmtShare(legacy.mc.fillRate.p50)}`],
          ["Lost sales", `${fmtInt(ai.mc.lost.p50)} units`, change(ai.mc.lost.p50, legacy.mc.lost.p50), true, `Legacy ${fmtInt(legacy.mc.lost.p50)}`],
          ["Waste", `${fmtInt(ai.mc.waste.p50)} units`, change(ai.mc.waste.p50, legacy.mc.waste.p50), true, `Legacy ${fmtInt(legacy.mc.waste.p50)}`],
          ["Total cost", fmtAED(ai.mc.totalCostAED.p50), change(ai.mc.totalCostAED.p50, legacy.mc.totalCostAED.p50), true, `Legacy ${fmtAED(legacy.mc.totalCostAED.p50)}`],
        ] as const).map(([label, value, c, lower, note]) => (
          <div role="listitem" key={label}>
            <KpiTile label={`${label} (AI)`} value={value}
              delta={label === "Fill rate" ? `${c >= 0 ? "+" : "−"}${Math.abs(c * 100).toFixed(1)} pts vs legacy` : `${fmtSignedPct(c, 0)} vs legacy`}
              better={lower ? c <= 0 : c >= 0} range={`${note} · median of ${RUNS} runs`} provenance="SCENARIO" />
          </div>
        )) : null}
      </div>

      <div className="col-span-12 xl:col-span-7">
        <ChartFrame title="Stock in and stock out, day by day" subtitle={`${chosenKey === "legacy" ? "Legacy rule" : "AI"} under this scenario (deterministic run)`}
          provenance="SCENARIO"
          legend={[{ label: "Demand", color: ENTITY_COLOR.truth }, { label: "Sales", color: chosenKey === "legacy" ? ENTITY_COLOR.baseline : ENTITY_COLOR.ai },
            { label: "On hand at close", color: otherSeriesColor(0) }, { label: "Receipts", color: otherSeriesColor(1), style: "dashed" },
            { label: "Waste", color: otherSeriesColor(4) }]}
          table={det ? <TableView caption="Daily stock flow" rows={det.rows} columns={[{ key: "d", label: "Date", value: (r) => dates[r.day] },
            { key: "dem", label: "Demand", value: (r) => r.demand, numeric: true }, { key: "s", label: "Sales", value: (r) => r.sales, numeric: true },
            { key: "l", label: "Lost", value: (r) => r.lost, numeric: true }, { key: "r", label: "Receipts", value: (r) => r.receipts, numeric: true },
            { key: "w", label: "Waste", value: (r) => r.waste, numeric: true }, { key: "o", label: "On hand", value: (r) => r.onHandClose, numeric: true },
            { key: "ord", label: "Order placed", value: (r) => r.order, numeric: true }]} /> : <p className="text-ink-muted">Computing…</p>}>
          {det ? (
            <TimeChart dates={dates} ariaLabel="Daily demand, sales, receipts, waste and stock on hand" height={280} series={[
              { id: "dem", label: "Demand", color: ENTITY_COLOR.truth, values: det.rows.map((r) => r.demand) },
              { id: "sales", label: "Sales", color: chosenKey === "legacy" ? ENTITY_COLOR.baseline : ENTITY_COLOR.ai, values: det.rows.map((r) => r.sales) },
              { id: "oh", label: "On hand", color: otherSeriesColor(0), values: det.rows.map((r) => r.onHandClose) },
              { id: "rec", label: "Receipts", color: otherSeriesColor(1), values: det.rows.map((r) => r.receipts), dashed: true },
              { id: "w", label: "Waste", color: otherSeriesColor(4), values: det.rows.map((r) => r.waste) },
            ]} />
          ) : <p className="text-ink-muted">Computing…</p>}
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
        <ChartFrame title="Compare the options" subtitle={`Median of ${RUNS} runs (P10–P90 in the table view)`} provenance="SCENARIO"
          table={result ? <TableView caption="Options, P10 to P90" rows={named} columns={[{ key: "o", label: "Option", value: (n) => n.label },
            { key: "f", label: "Fill rate P10–P90", value: (n) => `${fmtShare(result.results[n.key].mc.fillRate.p10)} – ${fmtShare(result.results[n.key].mc.fillRate.p90)}` },
            { key: "c", label: "Cost P10–P90", value: (n) => `${fmtAED(result.results[n.key].mc.totalCostAED.p10)} – ${fmtAED(result.results[n.key].mc.totalCostAED.p90)}` }]} /> : null}>
          {result ? (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Table (scrolls if wide)"><table className="data-table" data-testid="option-table">
              <thead><tr><th scope="col">Option</th><th scope="col" className="num">Fill rate</th><th scope="col" className="num">Lost</th>
                <th scope="col" className="num">Waste</th><th scope="col" className="num">Total cost</th></tr></thead>
              <tbody>{named.map((n) => {
                const k = result.results[n.key].mc;
                return (<tr key={n.key}><td>{n.label}</td><td className="num">{fmtShare(k.fillRate.p50)}</td><td className="num">{fmtInt(k.lost.p50)}</td>
                  <td className="num">{fmtInt(k.waste.p50)}</td><td className="num">{fmtAED(k.totalCostAED.p50)}</td></tr>);
              })}</tbody>
            </table></div>
          ) : <p className="text-ink-muted">Computing…</p>}
        </ChartFrame>
        <GlassPanel variant="deco" className="p-4 flex flex-col gap-3">
          <h3 className="text-ink font-semibold">Stock-in what-if</h3>
          <p className="text-ink-muted text-sm">Place one manual order and see the flow change (it replaces the policy&apos;s order that day).</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Order on day" value={scenario.policy.manualOrderDay} min={0} max={dates.length - 1}
              placeholder="none" onChange={(v) => set("policy.manualOrderDay", v)} />
            <NumberField label="Quantity (units)" value={scenario.policy.manualOrderQty} min={0} max={10000}
              placeholder="none" onChange={(v) => set("policy.manualOrderQty", v)} />
          </div>
        </GlassPanel>
      </div>

      <div className="col-span-12">
        <ChartFrame title="Surge Planner: how early do we stock up?"
          subtitle={`${base.spike ? "Your spike" : "Example spike (set one in the Scenario Console)"}: ${spike.magnitude}× for ${spike.days} days from day ${spike.startDay} (${dates[spike.startDay]}), known on day ${today}. Minimum warning for full cover: ${plan.minimumWarningDays} days.`}
          provenance="SCENARIO"
          legend={[{ label: "Lead time", color: "var(--ink-secondary)" }, { label: "Sellable window of a pre-built delivery", color: "var(--seq-300)", style: "band" }]}
          table={<TableView caption="Surge options" rows={plan.options} columns={[{ key: "o", label: "Option", value: (o) => SURGE_LABEL[o.option] },
            { key: "s", label: "Supplier", value: (o) => o.supplierId }, { key: "q", label: "Extra units ordered", value: (o) => o.orderedUnits, numeric: true },
            { key: "l", label: "Lost units", value: (o) => o.lostUnits, numeric: true }, { key: "p", label: "Purchase AED", value: (o) => o.purchaseAED, numeric: true },
            { key: "c", label: "CO2e kg", value: (o) => o.co2eKg, numeric: true }, { key: "n", label: "Note", value: (o) => o.note }]} />}>
          <SurgePlanner plan={plan} options={options} today={today} spikeStart={spike.startDay} spikeDays={spike.days}
            horizon={dates.length} sellable={sellable} />
          <ul className="surge-options">
            {plan.options.map((o) => (
              <li key={o.option}><strong className="text-ink">{SURGE_LABEL[o.option]}</strong>
                <span className="text-ink-secondary"> · lost {fmtInt(o.lostUnits)} units · extra purchase {fmtAED(o.purchaseAED)} · {o.note}</span></li>
            ))}
          </ul>
        </ChartFrame>
      </div>
    </>
  );
}

export function ScenarioStudio() {
  const { selection } = useScenario();
  const series = useSeries(selection.storeId, selection.skuId);
  const catalog = useArtefact("catalog.json");
  const mcdm = useArtefact("mcdm.json");
  return (
    <div className="page-grid py-6">
      <header className="col-span-12 flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Scenario Studio</h1>
        <p className="text-ink-secondary max-w-3xl">Push demand, spikes and supply around and watch the AI and the legacy rule respond. Every number here is computed in your browser.</p>
      </header>
      <DataState result={series} what="the series and its engine inputs" minHeight={400}>
        {(s) => (
          <DataState result={catalog} what="the catalogue">
            {(c) => <DataState result={mcdm} what="supplier metrics">{(m) => <Studio series={s} catalog={c} mcdm={m} />}</DataState>}
          </DataState>
        )}
      </DataState>
    </div>
  );
}



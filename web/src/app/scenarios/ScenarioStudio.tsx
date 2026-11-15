"use client";

/** Scenario Studio (plan §6.1 page 3): deep what-ifs on one hero store-SKU. Serves R1, R2, R4, R5, KQ1. */
import { ChartFrame, ENTITY_COLOR, otherSeriesColor, TableView, useSeriesFilter } from "@/components/charts/primitives";
import { TimeChart } from "@/components/charts/svg/charts";
import { SurgePlanner } from "@/components/signature/SurgePlanner";
import { NumberField } from "@/components/ui/controls";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { KpiTile } from "@/components/ui/KpiTile";
import type { CatalogFile, McdmFile, SeriesFile } from "@/lib/contracts";
import { useArtefact, useSeries } from "@/lib/data/hooks";
import type { EngineScenario } from "@/lib/engine/engine";
import { leadTimeMultiplier, toEngineScenario } from "@/lib/engine/scenario";
import { planSurge, type SupplierOption } from "@/lib/engine/surge";
import { useEngine } from "@/lib/engine/useEngine";
import { change, fmtAED, fmtDate, fmtShare, fmtSignedPct, fmtSignedPts, fmtUnits } from "@/lib/format";
import { likelyRange, policyName, serviceTargetLabel } from "@/lib/labels";
import { activeChips } from "@/lib/state/scenario";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

const RUNS = 50;
const SURGE_LABEL = { prebuild_primary: "Stock up early with the usual supplier", switch_faster: "Switch to the fastest supplier",
  split: "Split into two deliveries", accept_shortfall: "Do nothing extra" } as const;

function Studio({ series, catalog, mcdm }: { series: SeriesFile; catalog: CatalogFile; mcdm: McdmFile }) {
  const scenario = useScenario();
  const set = useScenarioStore((s) => s.set);
  const flowFilter = useSeriesFilter();
  const engine = series.engine;
  const base = toEngineScenario(scenario, engine);
  const supplierName = (id: string) => (mcdm.suppliers.find((s) => s.id === id)?.name ?? id).replace(" (fictional)", "");
  const tau = base.tau ?? engine.optimalTau;
  const named: { key: string; label: string; scenario: EngineScenario }[] = [
    { key: "legacy", label: policyName("P0"), scenario: { ...base, policy: "P0" } },
    { key: "ai", label: `AI, ${serviceTargetLabel(tau).toLowerCase()} (${base.tau === null ? "tuned on past data" : "your setting"})`, scenario: { ...base, policy: "AI" } },
    { key: "ai-95", label: "AI, stock-level setting 95% (more safety stock)", scenario: { ...base, policy: "AI", tau: 0.95 } },
    ...engine.leadTimes.slice(1).map((l, i) => ({
      key: `alt-${i + 1}`, label: `AI, buying from ${supplierName(l.supplierId)}`,
      scenario: { ...base, policy: "AI" as const, supplierIndex: i + 1, leadTimeMultiplier: leadTimeMultiplier(scenario, engine, i + 1) },
    })),
  ];
  const key = JSON.stringify([series.storeId, series.skuId, named.map((n) => n.scenario)]);
  const { result, p95 } = useEngine({ engine, scenarios: named.map(({ key: k, scenario: s }) => ({ key: k, scenario: s })), runs: RUNS }, key);
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
  const at = (i: number) => fmtDate(dates[Math.min(Math.max(0, i), dates.length - 1)]);
  const surgeNote = (o: (typeof plan.options)[number]) => {
    const who = o.supplierId ? supplierName(o.supplierId) : "";
    switch (o.option) {
      case "prebuild_primary": return o.supplierId ? `Order extra from ${who} so it arrives the day before the spike.` : "Too late: the usual supplier cannot deliver before the spike.";
      case "switch_faster": return `Order from ${who}, the fastest supplier that can still deliver in time.`;
      case "split": return `Two deliveries from ${who}, on ${at(spike.startDay - 1)} and ${at(spike.startDay - 1 + sellable)}, so nothing spoils.`;
      default: return "The extra demand during the spike goes unmet.";
    }
  };

  const legacy = result?.results.legacy;
  const ai = result?.results.ai;
  const det = result?.results[chosenKey]?.deterministic;
  const flow = det ? [
    { id: "dem", label: "Customer demand", color: ENTITY_COLOR.truth, values: det.rows.map((r) => r.demand) },
    { id: "sales", label: "Sales", color: chosenKey === "legacy" ? ENTITY_COLOR.baseline : ENTITY_COLOR.ai, values: det.rows.map((r) => r.sales) },
    { id: "oh", label: "Stock on the shelf at closing", color: otherSeriesColor(0), values: det.rows.map((r) => r.onHandClose) },
    { id: "rec", label: "Deliveries received", color: otherSeriesColor(1), values: det.rows.map((r) => r.receipts), dashed: true },
    { id: "w", label: "Thrown away", color: otherSeriesColor(4), values: det.rows.map((r) => r.waste) },
  ] : [];
  return (
    <>
      <GlassPanel variant="deco" className="col-span-12 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-ink">{store?.name} · {sku?.name} · the next {dates.length} days from {fmtDate(engine.planningStart)}</p>
          <p className="text-ink-muted text-sm">Your scenario: {activeChips(scenario).join(" · ") || "normal demand, no events"}. Change it with the Scenario button (top right).</p>
        </div>
        <p className="text-ink-muted text-sm tabular-nums" data-testid="recompute-time">
          {result ? `Recalculated ${named.length} options × ${RUNS} simulated runs in ${result.ms.toFixed(0)} ms (95% of recalculations under ${Math.max(1, Math.round(p95))} ms)` : "Calculating…"}
        </p>
      </GlassPanel>

      <p className="col-span-12 text-ink-secondary text-sm">
        <strong className="text-ink">AI ordering</strong> compared with the current method under your scenario. Each figure is the typical result of {RUNS} simulated runs.
      </p>
      <div className="col-span-12 kpi-row" role="list" aria-label="AI ordering compared with the current method for this scenario">
        {legacy && ai ? ([
          ["Customer demand met", fmtShare(ai.mc.fillRate.p50), ai.mc.fillRate.p50 - legacy.mc.fillRate.p50, false, `Current method ${fmtShare(legacy.mc.fillRate.p50)}`],
          ["Missed sales", fmtUnits(ai.mc.lost.p50), change(ai.mc.lost.p50, legacy.mc.lost.p50), true, `Current method ${fmtUnits(legacy.mc.lost.p50)}`],
          ["Thrown away", fmtUnits(ai.mc.waste.p50), change(ai.mc.waste.p50, legacy.mc.waste.p50), true, `Current method ${fmtUnits(legacy.mc.waste.p50)}`],
          ["Total cost of stock", fmtAED(ai.mc.totalCostAED.p50), change(ai.mc.totalCostAED.p50, legacy.mc.totalCostAED.p50), true, `Current method ${fmtAED(legacy.mc.totalCostAED.p50)}`],
        ] as const).map(([label, value, c, lower, note]) => (
          <div role="listitem" key={label}>
            <KpiTile label={label} value={value}
              delta={label === "Customer demand met" ? `${fmtSignedPts(c * 100)} vs current method` : `${fmtSignedPct(c, 0)} vs current method`}
              better={lower ? c <= 0 : c >= 0} range={note} provenance="SCENARIO" />
          </div>
        )) : null}
      </div>

      <div className="col-span-12 xl:col-span-7">
        <ChartFrame title="Stock coming in and going out, day by day" subtitle={`${chosenKey === "legacy" ? policyName("P0") : "AI ordering"} under your scenario (one typical run)`}
          provenance="SCENARIO" filter={flowFilter}
          legend={flow.map((f) => ({ id: f.id, label: f.label, color: f.color, style: f.dashed ? "dashed" as const : "solid" as const }))}
          note={<>All lines are units of this item per day. Deliveries arrive as spikes. When the stock on the shelf drops to zero,
            sales fall below demand: those are missed sales. Stock that reaches the end of its shelf life is thrown away.</>}
          table={det ? <TableView caption="Units per day" rows={det.rows} columns={[{ key: "d", label: "Date", value: (r) => fmtDate(dates[r.day]) },
            { key: "dem", label: "Customer demand", value: (r) => r.demand, numeric: true }, { key: "s", label: "Sales", value: (r) => r.sales, numeric: true },
            { key: "l", label: "Missed sales", value: (r) => r.lost, numeric: true }, { key: "r", label: "Deliveries received", value: (r) => r.receipts, numeric: true },
            { key: "w", label: "Thrown away", value: (r) => r.waste, numeric: true }, { key: "o", label: "Stock at closing", value: (r) => r.onHandClose, numeric: true },
            { key: "ord", label: "Order placed", value: (r) => r.order, numeric: true }]} /> : <p className="text-ink-muted">Calculating…</p>}>
          {det ? (
            <TimeChart dates={dates} ariaLabel="Daily customer demand, sales, deliveries, food thrown away and stock on the shelf" height={300}
              yLabel="Units per day" series={flow.filter((f) => flowFilter.isShown(f.id))} />
          ) : <p className="text-ink-muted">Calculating…</p>}
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
        <ChartFrame title="Compare the options" subtitle={`Typical result of ${RUNS} simulated runs for each option over the next ${dates.length} days`}
          provenance="SCENARIO"
          note={<>&ldquo;Stock-level setting&rdquo; is how much safety stock the AI keeps: higher means fewer empty shelves but more food at risk of
            expiring. The table view adds the likely range (8 in 10 runs fall inside it).</>}
          table={result ? <TableView caption="Options with their likely range" rows={named} columns={[{ key: "o", label: "Option", value: (n) => n.label },
            { key: "f", label: "Demand met, likely range", value: (n) => likelyRange(fmtShare(result.results[n.key].mc.fillRate.p10), fmtShare(result.results[n.key].mc.fillRate.p90)) },
            { key: "c", label: "Total cost, likely range", value: (n) => likelyRange(fmtAED(result.results[n.key].mc.totalCostAED.p10), fmtAED(result.results[n.key].mc.totalCostAED.p90)) }]} /> : null}>
          {result ? (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Table (scrolls if wide)"><table className="data-table" data-testid="option-table">
              <thead><tr><th scope="col">Option</th><th scope="col" className="num">Demand met</th><th scope="col" className="num">Missed sales (units)</th>
                <th scope="col" className="num">Thrown away (units)</th><th scope="col" className="num">Total cost</th></tr></thead>
              <tbody>{named.map((n) => {
                const k = result.results[n.key].mc;
                return (<tr key={n.key}><td>{n.label}</td><td className="num">{fmtShare(k.fillRate.p50)}</td><td className="num">{Math.round(k.lost.p50).toLocaleString("en-US")}</td>
                  <td className="num">{Math.round(k.waste.p50).toLocaleString("en-US")}</td><td className="num">{fmtAED(k.totalCostAED.p50)}</td></tr>);
              })}</tbody>
            </table></div>
          ) : <p className="text-ink-muted">Calculating…</p>}
        </ChartFrame>
        <GlassPanel variant="deco" className="p-4 flex flex-col gap-3">
          <h3 className="text-ink font-semibold">Try an extra order</h3>
          <p className="text-ink-muted text-sm">Add one order by hand and watch the day-by-day chart change. It replaces the order the method would have placed that day.</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={`Day of the order (0 = ${fmtDate(engine.planningStart)})`} value={scenario.policy.manualOrderDay} min={0} max={dates.length - 1}
              placeholder="none" onChange={(v) => set("policy.manualOrderDay", v)} />
            <NumberField label="Quantity (units)" value={scenario.policy.manualOrderQty} min={0} max={10000}
              placeholder="none" onChange={(v) => set("policy.manualOrderQty", v)} />
          </div>
        </GlassPanel>
      </div>

      <div className="col-span-12">
        <ChartFrame title="Surge planner: how early should we stock up?"
          subtitle={`${base.spike ? "Your spike" : "Example spike (add your own with the Scenario button)"}: demand ${spike.magnitude}× normal for ${spike.days} days from ${at(spike.startDay)}, known on ${at(today)}. Covering it fully needs at least ${plan.minimumWarningDays} days' warning.`}
          provenance="SCENARIO"
          legend={[{ label: "Time to deliver", color: "var(--ink-secondary)" }, { label: "When stock delivered before the spike can still be sold", color: "var(--seq-300)", style: "band" }]}
          note={<>Each row is a supplier. The circle marks the last day to place the order: <strong>✓ still possible</strong>,
            <strong> ✕ too late</strong>. The blue bar shows how long stock delivered just before the spike stays sellable. Order too
            early and it spoils; too late and the shelves run empty.</>}
          table={<TableView caption="Surge options" rows={plan.options} columns={[{ key: "o", label: "Option", value: (o) => SURGE_LABEL[o.option] },
            { key: "s", label: "Supplier", value: (o) => (o.supplierId ? supplierName(o.supplierId) : "None") },
            { key: "q", label: "Extra units ordered", value: (o) => o.orderedUnits, numeric: true },
            { key: "l", label: "Missed sales (units)", value: (o) => o.lostUnits, numeric: true }, { key: "p", label: "Extra purchase (AED)", value: (o) => o.purchaseAED, numeric: true },
            { key: "c", label: "Carbon (kg CO2e)", value: (o) => o.co2eKg, numeric: true }, { key: "n", label: "What it means", value: surgeNote }]} />}>
          <SurgePlanner plan={plan} options={options} names={Object.fromEntries(options.map((o) => [o.id, supplierName(o.id)]))} dates={dates}
            today={today} spikeStart={spike.startDay} spikeDays={spike.days} sellable={sellable} />
          <ul className="surge-options">
            {plan.options.map((o) => (
              <li key={o.option}><strong className="text-ink">{SURGE_LABEL[o.option]}</strong>
                <span className="text-ink-secondary"> · {fmtUnits(o.lostUnits)} of sales missed · extra purchase {fmtAED(o.purchaseAED)} · {surgeNote(o)}</span></li>
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
      <PageHeader accent="pink" eyebrow="What-if engine" title="Scenario Studio"
        description="Change demand, add a sudden spike or slow down suppliers, and see how the AI and the current method cope. The numbers recalculate instantly." />
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

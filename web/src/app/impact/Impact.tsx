"use client";

/**
 * Impact (plan §6.1 page 6): cost and sustainability against the baseline. Serves KQ4 and S4.
 * Honest framing (PROGRESS KI-13): the AI wastes MORE in absolute kilograms because it stocks for the recovered
 * demand it now serves; at equal availability it wastes about 41% less. Both facts are shown.
 */
import { scaleLinear } from "d3-scale";
import { useState } from "react";

import { ChartFrame, ENTITY_COLOR, TableView } from "@/components/charts/primitives";
import { CHART } from "@/components/charts/primitives/theme";
import { HBars, useWidth, XYChart } from "@/components/charts/svg/charts";
import { Select, Slider, Toggle } from "@/components/ui/controls";
import { DataState } from "@/components/ui/DataState";
import { KpiTile } from "@/components/ui/KpiTile";
import type { BacktestFile, FrontierFile, ImpactFile } from "@/lib/contracts";
import { useArtefact } from "@/lib/data/hooks";
import { change, fmtAED, fmtKg, fmtSignedPct } from "@/lib/format";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

type Point = FrontierFile["curves"][number]["points"][number];

/** The AI point at τ and the legacy point closest in availability (the "same availability" comparison). */
export function equalAvailability(file: FrontierFile, tau: number) {
  const ai = file.curves.find((c) => c.policyId !== "P0")!.points;
  const legacy = file.curves.find((c) => c.policyId === "P0")!.points;
  const at = ai.reduce((a, b) => (Math.abs(b.serviceTarget - tau) < Math.abs(a.serviceTarget - tau) ? b : a));
  const near = legacy.reduce((a, b) => (Math.abs(b.availabilityPct - at.availabilityPct) < Math.abs(a.availabilityPct - at.availabilityPct) ? b : a));
  const gap = at.availabilityPct - near.availabilityPct;
  return { ai: at, legacy: near, gapPts: gap, wasteChange: change(at.wastePct, near.wastePct), costChange: change(at.totalCostAED, near.totalCostAED) };
}

/** Floating bars for a cost waterfall: each delta starts where the running total ended. */
export function waterfallBars(rows: ImpactFile["waterfall"]) {
  let run = 0;
  return rows.map((r) => {
    if (r.kind === "baseline" || r.kind === "total") { run = r.valueAED; return { ...r, from: 0, to: r.valueAED }; }
    const from = run;
    run += r.valueAED;
    return { ...r, from, to: run };
  });
}

/** Illustrative tornado: scale each delta component by ±pct (others fixed) and report the annual saving. */
export function tornado(rows: ImpactFile["waterfall"], pct: number) {
  const deltas = rows.filter((r) => r.kind === "delta");
  const saving = -deltas.reduce((s, r) => s + r.valueAED, 0);
  return {
    saving,
    bars: deltas.map((r) => ({ id: r.id, label: r.label, low: saving + r.valueAED * pct, high: saving - r.valueAED * pct }))
      .sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low)),
  };
}

function Waterfall({ rows }: { rows: ImpactFile["waterfall"] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const bars = waterfallBars(rows);
  const m = { t: 16, r: 16, b: 64, l: 64 };
  const height = 300;
  const band = (width - m.l - m.r) / bars.length;
  const y = scaleLinear().domain([0, Math.max(...bars.map((b) => Math.max(b.from, b.to))) * 1.08]).nice().range([height - m.b, m.t]);
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" className="chart-svg" aria-label="Cost waterfall from the baseline's total cost to the AI's">
        {y.ticks(4).map((t) => (
          <g key={t}><line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fill={CHART.inkMuted} fontSize={11}>{fmtAED(t)}</text></g>
        ))}
        {bars.map((b, i) => {
          const x0 = m.l + i * band + band * 0.18;
          const w = band * 0.64;
          const saves = b.kind === "delta" && b.valueAED < 0;
          const color = b.kind === "baseline" ? ENTITY_COLOR.baseline : b.kind === "total" ? ENTITY_COLOR.ai : saves ? "var(--seq-300)" : "var(--ink-secondary)";
          const top = Math.min(y(b.from), y(b.to));
          return (
            <g key={b.id}>
              <rect x={x0} y={top} width={w} height={Math.max(2, Math.abs(y(b.from) - y(b.to)))} rx={3} fill={color} />
              <text x={x0 + w / 2} y={top - 6} textAnchor="middle" fill="var(--ink-primary)" fontSize={12}>
                {b.kind === "delta" ? `${b.valueAED < 0 ? "−" : "+"}${fmtAED(Math.abs(b.valueAED))}` : fmtAED(b.valueAED)}</text>
              <foreignObject x={m.l + i * band} y={height - m.b + 6} width={band} height={m.b - 6}>
                <p className="waterfall-label">{b.label}</p>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const METRICS = [
  { value: "availabilityPct", label: "Availability (%)", lower: false, fmt: (v: number) => `${v.toFixed(1)}%` },
  { value: "lostSalesAED", label: "Lost sales (AED)", lower: true, fmt: fmtAED },
  { value: "wasteKg", label: "Waste (kg)", lower: true, fmt: fmtKg },
  { value: "totalCostAED", label: "Total cost (AED)", lower: true, fmt: fmtAED },
  { value: "co2eKg", label: "CO2e (kg)", lower: true, fmt: fmtKg },
] as const;

function Body({ impact, frontier, backtest }: { impact: ImpactFile; frontier: FrontierFile; backtest: BacktestFile }) {
  const scenario = useScenario();
  const set = useScenarioStore((s) => s.set);
  const taus = frontier.curves.find((c) => c.policyId !== "P0")!.points.map((p) => p.serviceTarget);
  const tau = scenario.policy.serviceTarget ?? frontier.recommended.serviceTarget;
  const tauIndex = taus.reduce((best, t, i) => (Math.abs(t - tau) < Math.abs(taus[best] - tau) ? i : best), 0);
  const eq = equalAvailability(frontier, taus[tauIndex]);
  const [metric, setMetric] = useState<(typeof METRICS)[number]["value"]>("totalCostAED");
  const [spread, setSpread] = useState(0.25);
  const rescue = scenario.policy.foodRescue;
  const def = METRICS.find((m) => m.value === metric)!;
  const tor = tornado(impact.waterfall, spread);
  const aiWaste = impact.waste.aiKg - (rescue ? impact.waste.foodRescueKg : 0);
  const legacyMax = frontier.curves.find((c) => c.policyId === "P0")!.points.reduce((a, b) => (b.availabilityPct > a.availabilityPct ? b : a));
  // The AI point closest in availability to the legacy rule's best (P1 at τ 0.50 vs P0 at τ 0.99: docs/06-decisions.md §4).
  const aiMatch = frontier.curves.find((c) => c.policyId !== "P0")!.points
    .reduce((a, b) => (Math.abs(b.availabilityPct - legacyMax.availabilityPct) < Math.abs(a.availabilityPct - legacyMax.availabilityPct) ? b : a));
  const curves = frontier.curves.map((c) => ({
    id: c.policyId, label: c.policyId === "P0" ? "Baseline (legacy rule)" : `AI (${c.policyId})`,
    color: c.policyId === "P0" ? ENTITY_COLOR.baseline : ENTITY_COLOR.ai,
    points: c.points.map((p: Point) => ({ x: p.availabilityPct, y: p.wastePct, label: `τ ${p.serviceTarget}` })),
  }));
  const kpi = (w: string, p: string) => backtest.results.find((r) => r.windowId === w && r.policyId === p)?.kpis[metric]?.p50;
  const maxVal = Math.max(...backtest.results.map((r) => r.kpis[metric].p50));
  return (
    <>
      <div className="col-span-12 kpi-row" role="list" aria-label="Annualised impact">
        <div role="listitem"><KpiTile label="Annual cost saving" value={fmtAED(tor.saving)} delta={`${fmtSignedPct(change(impact.waterfall.at(-1)!.valueAED, impact.waterfall[0].valueAED), 0)} total cost vs baseline`} better provenance="DERIVED" range="Illustrative: fictional 8-store operator" /></div>
        <div role="listitem"><KpiTile label="Waste at equal availability" value={fmtSignedPct(change(aiMatch.wastePct, legacyMax.wastePct), 0)}
          delta={`AI ${aiMatch.availabilityPct.toFixed(1)}% available vs the legacy rule's best ${legacyMax.availabilityPct.toFixed(1)}%`} better provenance="PRECOMPUTED" /></div>
        <div role="listitem"><KpiTile label="Absolute waste (AI)" value={fmtKg(aiWaste)} delta={`${fmtSignedPct(change(aiWaste, impact.waste.baselineKg), 0)} vs baseline: it now serves the hidden demand`}
          better={aiWaste <= impact.waste.baselineKg} provenance="DERIVED" range={rescue ? `After ${fmtKg(impact.waste.foodRescueKg)} food rescue` : "Before food rescue"} /></div>
        <div role="listitem"><KpiTile label="CO2e (AI)" value={fmtKg(impact.co2e.aiKg)} delta={`${fmtSignedPct(change(impact.co2e.aiKg, impact.co2e.baselineKg), 0)} vs baseline (more food sold and moved)`}
          better={impact.co2e.aiKg <= impact.co2e.baselineKg} provenance="DERIVED" /></div>
      </div>

      <div className="col-span-12 xl:col-span-7">
        <ChartFrame title="Waste–Availability Frontier" subtitle="Drag along the AI curve, or use the slider. Lower right is better. Jan–Oct 2026, all 320 series."
          provenance="PRECOMPUTED" legend={curves.map((c) => ({ label: c.label, color: c.color }))}
          table={<TableView caption="Frontier points" rows={frontier.curves.flatMap((c) => c.points.map((p) => ({ ...p, policy: c.policyId })))}
            columns={[{ key: "p", label: "Policy", value: (r) => r.policy }, { key: "t", label: "Service τ", value: (r) => r.serviceTarget, numeric: true },
              { key: "a", label: "Availability %", value: (r) => r.availabilityPct, numeric: true }, { key: "w", label: "Waste %", value: (r) => r.wastePct, numeric: true },
              { key: "c", label: "Total cost AED", value: (r) => r.totalCostAED, numeric: true }]} />}>
          <div data-testid="frontier">
            <XYChart curves={curves} xLabel="Availability (% of trading hours in stock)" yLabel="Waste (% of receipts)" height={300}
              ariaLabel="Waste against availability; the marker is the AI at the chosen service target" formatX={(v) => `${v}%`} formatY={(v) => `${v}%`}
              marker={{ x: eq.ai.availabilityPct, y: eq.ai.wastePct, label: `AI at τ ${eq.ai.serviceTarget}`, color: "var(--ink-primary)" }}
              pick={{ curveId: curves.find((c) => c.id !== "P0")!.id, onIndex: (i) => set("policy.serviceTarget", taus[i]) }} />
          </div>
          <Slider label="Service target τ (shared with the Scenario Console)" value={tauIndex} min={0} max={taus.length - 1} step={1}
            format={(i) => `τ ${taus[i]}`} onChange={(i) => set("policy.serviceTarget", taus[i])} />
          <p className="text-ink-secondary text-sm mt-2" data-testid="frontier-readout">
            At τ {eq.ai.serviceTarget}, the AI keeps shelves stocked {eq.ai.availabilityPct.toFixed(1)}% of the time with {eq.ai.wastePct.toFixed(2)}% waste.{" "}
            {eq.gapPts > 0.5
              ? `The legacy rule cannot reach that availability at any buffer: its best is ${legacyMax.availabilityPct.toFixed(1)}% with ${legacyMax.wastePct.toFixed(2)}% waste.`
              : `The legacy rule at the same availability wastes ${eq.legacy.wastePct.toFixed(2)}% (AI ${fmtSignedPct(eq.wasteChange, 0)}).`}
          </p>
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-5">
        <ChartFrame title="Where the saving comes from" subtitle={`Annualised (${impact.period.start} to ${impact.period.end} × 12/10), AED`} provenance="DERIVED"
          legend={[{ label: "Baseline", color: ENTITY_COLOR.baseline, style: "bar" }, { label: "Saves", color: "var(--seq-300)", style: "bar" },
            { label: "Adds", color: "var(--ink-secondary)", style: "bar" }, { label: "AI", color: ENTITY_COLOR.ai, style: "bar" }]}
          table={<TableView caption="Cost waterfall" rows={impact.waterfall} columns={[{ key: "l", label: "Step", value: (r) => r.label },
            { key: "v", label: "AED", value: (r) => r.valueAED, numeric: true }]} />}>
          <Waterfall rows={impact.waterfall} />
          <p className="text-ink-muted text-xs mt-2">{impact.annualisation}</p>
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ChartFrame title="Waste and emissions" subtitle="Absolute totals rise because the AI sells far more of the demand that empty shelves used to hide"
          provenance="DERIVED"
          table={<TableView caption="Waste and CO2e" rows={[{ k: "Waste kg", b: impact.waste.baselineKg, a: aiWaste },
            ...impact.co2e.byComponent.map((c) => ({ k: `CO2e kg: ${c.label}`, b: c.baselineKg, a: c.aiKg }))]}
            columns={[{ key: "k", label: "Measure", value: (r) => r.k }, { key: "b", label: "Baseline", value: (r) => r.b, numeric: true },
              { key: "a", label: "AI", value: (r) => r.a, numeric: true }]} />}>
          <Toggle label="Divert expiring stock to food rescue" checked={rescue} onChange={(v) => set("policy.foodRescue", v)}
            description={`${impact.assumptions.find((a) => a.id === "food-rescue")?.value ?? 50}% of expiring kilograms (assumption)`} />
          <HBars ariaLabel="Waste and CO2e, baseline vs AI" format={fmtKg} rows={[
            { label: "Waste · baseline", value: impact.waste.baselineKg, color: ENTITY_COLOR.baseline },
            { label: `Waste · AI${rescue ? " after rescue" : ""}`, value: aiWaste, color: ENTITY_COLOR.ai, emphasis: true },
            ...impact.co2e.byComponent.flatMap((c) => [
              { label: `CO2e ${c.label.toLowerCase()} · baseline`, value: c.baselineKg, color: ENTITY_COLOR.baseline },
              { label: `CO2e ${c.label.toLowerCase()} · AI`, value: c.aiKg, color: ENTITY_COLOR.ai },
            ]),
          ]} />
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ChartFrame title="Which assumptions matter?" subtitle={`Illustrative: each cost component ±${Math.round(spread * 100)}% with the others fixed`}
          provenance="SCENARIO"
          table={<TableView caption="Tornado" rows={tor.bars} columns={[{ key: "l", label: "Component", value: (b) => b.label },
            { key: "lo", label: "Saving if lower", value: (b) => Math.round(b.low), numeric: true }, { key: "hi", label: "Saving if higher", value: (b) => Math.round(b.high), numeric: true }]} />}>
          <Slider label="Swing" value={spread} min={0.1} max={0.5} step={0.05} format={(v) => `±${Math.round(v * 100)}%`} onChange={setSpread} />
          <ul className="tornado" data-testid="tornado">
            {tor.bars.map((b) => {
              const lo = Math.min(b.low, b.high);
              const hi = Math.max(b.low, b.high);
              const all = tor.bars.flatMap((t) => [t.low, t.high]);
              const s = scaleLinear().domain([Math.min(...all), Math.max(...all)]).range([0, 100]);
              return (
                <li key={b.id}>
                  <span className="text-ink-secondary text-sm">{b.label}</span>
                  <span className="tornado-track">
                    <span className="tornado-bar" style={{ left: `${s(lo)}%`, width: `${Math.max(1, s(hi) - s(lo))}%` }} />
                    <span className="tornado-mid" style={{ left: `${s(tor.saving)}%` }} />
                  </span>
                  <span className="text-ink-muted text-xs tabular-nums">{fmtAED(lo)}–{fmtAED(hi)}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-ink-muted text-xs">Centre line: the base saving of {fmtAED(tor.saving)} a year. Assumptions: {impact.assumptions.filter((a) => a.sourceId === null).map((a) => `${a.label} ${a.value} ${a.unit}`).join("; ")}.</p>
        </ChartFrame>
      </div>

      <div className="col-span-12">
        <ChartFrame title="KPIs across stress windows" subtitle="Median of the Monte Carlo runs per window. P0 legacy · P1 AI daily · P2 + noon top-up · P3 + smart sourcing"
          provenance="PRECOMPUTED"
          table={<TableView caption="KPIs across windows" rows={backtest.windows} columns={[{ key: "w", label: "Window", value: (w) => w.label },
            ...backtest.policies.map((p) => ({ key: p.id, label: p.id, value: (w: BacktestFile["windows"][number]) => kpi(w.id, p.id) ?? "–", numeric: true }))]} />}>
          <div className="w-[260px] mb-3"><Select label="Measure" value={metric} options={METRICS} onChange={setMetric} /></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Table (scrolls if wide)">
            <table className="data-table" data-testid="window-table">
              <thead><tr><th scope="col">Window</th>{backtest.policies.map((p) => <th key={p.id} scope="col" className="num">{p.id} · {p.label}</th>)}</tr></thead>
              <tbody>{backtest.windows.map((w) => {
                const vals = backtest.policies.map((p) => kpi(w.id, p.id) ?? NaN);
                const best = def.lower ? Math.min(...vals) : Math.max(...vals);
                return (
                  <tr key={w.id}><th scope="row">{w.label}</th>
                    {vals.map((v, i) => (
                      <td key={i} className="num">
                        <span className="cell-bar" style={{ width: `${(v / maxVal) * 100}%` }} aria-hidden="true" />
                        <span className={v === best ? "text-ink font-semibold" : ""}>{def.fmt(v)}{v === best ? " ★" : ""}</span>
                      </td>
                    ))}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <p className="text-ink-muted text-xs mt-2">★ best policy in the window for this measure.</p>
        </ChartFrame>
      </div>
    </>
  );
}

export function Impact() {
  const impact = useArtefact("impact.json");
  const frontier = useArtefact("frontier.json");
  const backtest = useArtefact("backtest.json");
  return (
    <div className="page-grid py-6">
      <header className="col-span-12 flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Impact</h1>
        <p className="text-ink-secondary max-w-3xl">What the AI changes in cost, waste and emissions for a fictional eight-store operator. Figures are synthetic and illustrative.</p>
      </header>
      <DataState result={impact} what="the impact summary" minHeight={400}>
        {(i) => (
          <DataState result={frontier} what="the frontier">
            {(f) => <DataState result={backtest} what="the backtest">{(b) => <Body impact={i} frontier={f} backtest={b} />}</DataState>}
          </DataState>
        )}
      </DataState>
    </div>
  );
}

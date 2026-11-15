"use client";

/**
 * Impact (plan §6.1 page 6): cost and sustainability against the baseline. Serves KQ4 and S4.
 * Honest framing (PROGRESS KI-13): the AI wastes MORE in absolute kilograms because it stocks for the recovered
 * demand it now serves; at equal availability it wastes about 41% less. Both facts are shown.
 */
import { scaleLinear } from "d3-scale";
import { useState } from "react";

import { ChartFrame, ENTITY_COLOR, TableView, useSeriesFilter } from "@/components/charts/primitives";
import { CHART } from "@/components/charts/primitives/theme";
import { HBars, useWidth, XYChart } from "@/components/charts/svg/charts";
import { Select, Slider, Toggle } from "@/components/ui/controls";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiTile } from "@/components/ui/KpiTile";
import type { BacktestFile, FrontierFile, ImpactFile } from "@/lib/contracts";
import { useArtefact } from "@/lib/data/hooks";
import { aedAxis, change, fmtAED, fmtDate, fmtKg, fmtSignedPct } from "@/lib/format";
import { POLICY_HELP, policyName, serviceTargetLabel } from "@/lib/labels";
import { type PolicyId, WINDOW_LABELS, type WindowId } from "@/lib/state/scenario";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

/** Plain names for the cost steps (the data file's labels carry policy codes). */
const STEP_LABEL: Record<string, string> = {
  "baseline-cost": "Current method: total cost",
  "lost-margin-goodwill": "Fewer missed sales (profit and goodwill)",
  waste: "Cost of food thrown away",
  holding: "Cost of holding stock",
  expedite: "Top-ups and supplier premiums",
  "ai-cost": "AI ordering: total cost",
};
const stepLabel = (r: { id: string; label: string }) => STEP_LABEL[r.id] ?? r.label;

/** An assumption in words: "Goodwill cost of a missed sale: 10% of price". */
function assumptionText(a: ImpactFile["assumptions"][number]): string {
  const unit = a.unit.startsWith("%") ? `%${a.unit.slice(1)}` : ` ${a.unit.replace("AED/kg", "AED per kg").replace(/^x$/, "×")}`;
  return `${a.label.toLowerCase()} ${a.value}${unit}`;
}

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
  // On phones the bars are too narrow for their names: they get numbers, and a numbered key follows the chart.
  const compact = (width - 82) / bars.length < 72;
  const m = { t: 22, r: 16, b: compact ? 28 : 88, l: 66 };
  const height = compact ? 280 : 336;
  const band = (width - m.l - m.r) / bars.length;
  const top = Math.max(...bars.map((b) => Math.max(b.from, b.to)));
  const y = scaleLinear().domain([0, top * 1.08]).nice().range([height - m.b, m.t]);
  // Bar labels and ticks in the axis unit (AED million), so they stay short enough for narrow bars.
  const axis = aedAxis(top);
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" className="chart-svg" aria-label="Yearly cost: from the current method's total to the AI's, step by step">
        {y.ticks(4).map((t) => (
          <g key={t}><line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fill={CHART.inkMuted} fontSize={11} className="tabular-nums">{axis.tick(t)}</text></g>
        ))}
        <text transform={`translate(14 ${(height - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle" fill={CHART.ink} fontSize={12}>{`Cost per year (${axis.unit})`}</text>
        {bars.map((b, i) => {
          const x0 = m.l + i * band + band * 0.18;
          const w = band * 0.64;
          const saves = b.kind === "delta" && b.valueAED < 0;
          const color = b.kind === "baseline" ? ENTITY_COLOR.baseline : b.kind === "total" ? ENTITY_COLOR.ai : saves ? "var(--seq-300)" : "var(--ink-secondary)";
          const barTop = Math.min(y(b.from), y(b.to));
          return (
            <g key={b.id}>
              <rect x={x0} y={barTop} width={w} height={Math.max(2, Math.abs(y(b.from) - y(b.to)))} rx={3} fill={color}>
                <title>{`${stepLabel(b)}: ${b.kind === "delta" ? (b.valueAED < 0 ? "saves " : "adds ") : ""}${fmtAED(Math.abs(b.valueAED))} a year`}</title>
              </rect>
              <text x={x0 + w / 2} y={barTop - 6} textAnchor="middle" fill="var(--ink-primary)" fontSize={12} className="tabular-nums">
                {b.kind === "delta" ? `${b.valueAED < 0 ? "−" : "+"}${axis.tick(Math.abs(b.valueAED))}` : axis.tick(b.valueAED)}</text>
              {compact ? (
                <text x={x0 + w / 2} y={height - m.b + 18} textAnchor="middle" fill={CHART.inkMuted} fontSize={12}>{i + 1}</text>
              ) : (
                <foreignObject x={m.l + i * band} y={height - m.b + 6} width={band} height={m.b - 6}>
                  <p className="waterfall-label">{stepLabel(b)}</p>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
      {compact ? (
        <ol className="waterfall-key">
          {bars.map((b) => (
            <li key={b.id}><span className="text-ink-secondary">{stepLabel(b)}</span>
              <span className="tabular-nums text-ink">{b.kind === "delta" ? (b.valueAED < 0 ? "−" : "+") : ""}{fmtAED(Math.abs(b.valueAED))}</span></li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

const METRICS = [
  { value: "availabilityPct", label: "Shelves in stock (% of opening hours)", lower: false, fmt: (v: number) => `${v.toFixed(1)}%` },
  { value: "lostSalesAED", label: "Value of missed sales (AED)", lower: true, fmt: fmtAED },
  { value: "wasteKg", label: "Food thrown away (kg)", lower: true, fmt: fmtKg },
  { value: "totalCostAED", label: "Total cost of stock (AED)", lower: true, fmt: fmtAED },
  { value: "co2eKg", label: "Carbon emissions (kg CO2e)", lower: true, fmt: (v: number) => `${fmtKg(v)} CO2e` },
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
  const filter = useSeriesFilter();
  const aiCurve = frontier.curves.find((c) => c.policyId !== "P0")!.policyId;
  const curves = frontier.curves.map((c) => ({
    id: c.policyId, label: policyName(c.policyId),
    color: c.policyId === "P0" ? ENTITY_COLOR.baseline : ENTITY_COLOR.ai,
    points: c.points.map((p: Point) => ({ x: p.availabilityPct, y: p.wastePct, label: serviceTargetLabel(p.serviceTarget) })),
  }));
  const co2 = (v: number) => `${fmtKg(v)} CO2e`;
  const pct = (t: number) => `${Math.round(t * 100)}%`;
  const kpi = (w: string, p: string) => backtest.results.find((r) => r.windowId === w && r.policyId === p)?.kpis[metric]?.p50;
  const maxVal = Math.max(...backtest.results.map((r) => r.kpis[metric].p50));
  return (
    <>
      <p className="col-span-12 text-ink-secondary text-sm">
        <strong className="text-ink">AI ordering</strong> compared with the current method, across all eight stores and forty items.
        Money is per year; waste and emissions are for 1 Jan to 31 Oct 2026.
      </p>
      <div className="col-span-12 kpi-row" role="list" aria-label="Impact of AI ordering compared with the current method">
        <div role="listitem"><KpiTile label="Yearly cost saving" value={fmtAED(tor.saving)} delta={`${fmtSignedPct(change(impact.waterfall.at(-1)!.valueAED, impact.waterfall[0].valueAED), 0)} total cost vs current method`} better provenance="DERIVED" range="Illustrative: a fictional eight-store retailer" /></div>
        <div role="listitem"><KpiTile label="Waste at the same shelf availability" value={fmtSignedPct(change(aiMatch.wastePct, legacyMax.wastePct), 0)}
          delta={`AI: shelves stocked ${aiMatch.availabilityPct.toFixed(1)}% of the time; current method at best ${legacyMax.availabilityPct.toFixed(1)}%`} better provenance="PRECOMPUTED" /></div>
        <div role="listitem"><KpiTile label="Food thrown away (AI)" value={fmtKg(aiWaste)} delta={`${fmtSignedPct(change(aiWaste, impact.waste.baselineKg), 0)} vs current method, because it sells far more`}
          better={aiWaste <= impact.waste.baselineKg} provenance="DERIVED" range={rescue ? `After ${fmtKg(impact.waste.foodRescueKg)} sent to food rescue` : "Before food rescue"} /></div>
        <div role="listitem"><KpiTile label="Carbon emissions (AI)" value={co2(impact.co2e.aiKg)} delta={`${fmtSignedPct(change(impact.co2e.aiKg, impact.co2e.baselineKg), 0)} vs current method (more food sold and moved)`}
          better={impact.co2e.aiKg <= impact.co2e.baselineKg} provenance="DERIVED" /></div>
      </div>

      <div className="col-span-12 xl:col-span-7">
        <ChartFrame title="Food waste vs shelf availability: choose a stock-level setting" subtitle="Drag along the AI line, or use the slider. All 320 item-store combinations, 1 Jan to 31 Oct 2026."
          provenance="PRECOMPUTED" filter={filter} legend={curves.map((c) => ({ id: c.id, label: c.label, color: c.color }))}
          note={<>Each dot is one stock-level setting. Further <strong>right</strong> means shelves were stocked more of the time;
            further <strong>down</strong> means a smaller share of the stock was thrown away. A higher setting moves the AI up and to the right.</>}
          table={<TableView caption="Settings tested" rows={frontier.curves.flatMap((c) => c.points.map((p) => ({ ...p, policy: c.policyId })))}
            columns={[{ key: "p", label: "Ordering method", value: (r) => policyName(r.policy) }, { key: "t", label: "Stock-level setting", value: (r) => pct(r.serviceTarget) },
              { key: "a", label: "Shelves in stock (% of opening hours)", value: (r) => r.availabilityPct, numeric: true },
              { key: "w", label: "Waste (% of stock received)", value: (r) => r.wastePct, numeric: true },
              { key: "c", label: "Total cost (AED)", value: (r) => Math.round(r.totalCostAED), numeric: true }]} />}>
          <div data-testid="frontier">
            <XYChart curves={curves.filter((c) => filter.isShown(c.id))} xLabel="Shelves in stock (% of opening hours)" yLabel="Waste (% of stock received)" height={300}
              ariaLabel="Food waste against shelf availability; the marker is the AI at the chosen setting" formatX={(v) => `${v}%`} formatY={(v) => `${v}%`}
              marker={filter.isShown(aiCurve) ? { x: eq.ai.availabilityPct, y: eq.ai.wastePct, label: `AI at ${pct(eq.ai.serviceTarget)}`, color: "var(--ink-primary)" } : undefined}
              pick={filter.isShown(aiCurve) ? { curveId: aiCurve, onIndex: (i) => set("policy.serviceTarget", taus[i]) } : undefined} />
          </div>
          <Slider label="AI stock-level setting (also used in Scenario Studio)" value={tauIndex} min={0} max={taus.length - 1} step={1}
            format={(i) => pct(taus[i])} onChange={(i) => set("policy.serviceTarget", taus[i])} />
          <p className="text-ink-secondary text-sm mt-2" data-testid="frontier-readout">
            With the setting at {pct(eq.ai.serviceTarget)}, the AI keeps shelves stocked {eq.ai.availabilityPct.toFixed(1)}% of opening hours and throws
            away {eq.ai.wastePct.toFixed(2)}% of the stock it receives.{" "}
            {eq.gapPts > 0.5
              ? `The current method cannot reach that availability with any amount of extra stock: at best it reaches ${legacyMax.availabilityPct.toFixed(1)}%, throwing away ${legacyMax.wastePct.toFixed(2)}%.`
              : `At the same availability the current method throws away ${eq.legacy.wastePct.toFixed(2)}% (AI ${fmtSignedPct(eq.wasteChange, 0)}).`}
          </p>
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-5">
        <ChartFrame title="Where the saving comes from" subtitle="Cost per year, in AED million" provenance="DERIVED"
          legend={[{ label: "Current method", color: ENTITY_COLOR.baseline, style: "bar" }, { label: "Saving", color: "var(--seq-300)", style: "bar" },
            { label: "Extra cost", color: "var(--ink-secondary)", style: "bar" }, { label: "AI ordering", color: ENTITY_COLOR.ai, style: "bar" }]}
          note={<>Start from the current method&apos;s yearly cost on the left, take away what each change saves (or add what it costs),
            and you arrive at the AI&apos;s yearly cost on the right. Simulated {fmtDate(impact.period.start)} to {fmtDate(impact.period.end)},
            scaled up to twelve months; illustrative figures for a fictional eight-store retailer.</>}
          table={<TableView caption="Cost per year, step by step" rows={impact.waterfall} columns={[{ key: "l", label: "Step", value: stepLabel },
            { key: "v", label: "AED per year", value: (r) => Math.round(r.valueAED), numeric: true }]} />}>
          <Waterfall rows={impact.waterfall} />
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ChartFrame title="Food thrown away and carbon emissions" subtitle="Totals for 1 Jan to 31 Oct 2026, all stores"
          provenance="DERIVED"
          note={<>Both totals go up with the AI because it sells much more of the demand that empty shelves used to hide, so more food
            is bought, moved and handled. Per unit sold, and at the same shelf availability, it wastes less (see the chart above).</>}
          table={<TableView caption="Food thrown away and emissions" rows={[{ k: "Food thrown away (kg)", b: impact.waste.baselineKg, a: aiWaste },
            ...impact.co2e.byComponent.map((c) => ({ k: `Carbon emissions from ${c.label.toLowerCase()} (kg CO2e)`, b: c.baselineKg, a: c.aiKg }))]}
            columns={[{ key: "k", label: "Measure", value: (r) => r.k }, { key: "b", label: "Current method", value: (r) => Math.round(r.b), numeric: true },
              { key: "a", label: "AI ordering", value: (r) => Math.round(r.a), numeric: true }]} />}>
          <Toggle label="Send expiring food to food-rescue partners" checked={rescue} onChange={(v) => set("policy.foodRescue", v)}
            description={`${impact.assumptions.find((a) => a.id === "food-rescue")?.value ?? 50}% of food near its expiry date goes to food rescue instead of the bin (assumption)`} />
          <h3 className="stat-label mt-3 mb-1">Food thrown away (kg)</h3>
          <HBars ariaLabel="Food thrown away, current method and AI" format={fmtKg} rows={[
            { label: "Current method", value: impact.waste.baselineKg, color: ENTITY_COLOR.baseline },
            { label: `AI ordering${rescue ? " (after food rescue)" : ""}`, value: aiWaste, color: ENTITY_COLOR.ai, emphasis: true },
          ]} />
          <h3 className="stat-label mt-3 mb-1">Carbon emissions (kg CO2e)</h3>
          <HBars ariaLabel="Carbon emissions by source, current method and AI" format={co2} rows={impact.co2e.byComponent.flatMap((c) => [
            { label: `${c.label} · current method`, value: c.baselineKg, color: ENTITY_COLOR.baseline },
            { label: `${c.label} · AI ordering`, value: c.aiKg, color: ENTITY_COLOR.ai },
          ])} />
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ChartFrame title="Which parts of the saving matter most?" subtitle={`Illustrative: each part made ${Math.round(spread * 100)}% bigger or smaller, the others unchanged`}
          provenance="SCENARIO"
          note={<>Each bar shows the range of the yearly saving if that one part turned out {Math.round(spread * 100)}% higher or lower than estimated.
            The white line is the base saving of {fmtAED(tor.saving)} a year. <strong>The longer the bar, the more the saving depends on it.</strong>
            {" "}Assumptions behind the costs: {impact.assumptions.filter((a) => a.sourceId === null && a.id !== "annualisation").map(assumptionText).join("; ")}.</>}
          table={<TableView caption="Yearly saving if each part is higher or lower" rows={tor.bars} columns={[{ key: "l", label: "Part of the saving", value: (b) => STEP_LABEL[b.id] ?? b.label },
            { key: "lo", label: "Yearly saving, low (AED)", value: (b) => Math.round(Math.min(b.low, b.high)), numeric: true },
            { key: "hi", label: "Yearly saving, high (AED)", value: (b) => Math.round(Math.max(b.low, b.high)), numeric: true }]} />}>
          <Slider label="How much to vary each part" value={spread} min={0.1} max={0.5} step={0.05} format={(v) => `±${Math.round(v * 100)}%`} onChange={setSpread} />
          <ul className="tornado" data-testid="tornado">
            {tor.bars.map((b) => {
              const lo = Math.min(b.low, b.high);
              const hi = Math.max(b.low, b.high);
              const all = tor.bars.flatMap((t) => [t.low, t.high]);
              const s = scaleLinear().domain([Math.min(...all), Math.max(...all)]).range([0, 100]);
              return (
                <li key={b.id}>
                  <span className="text-ink-secondary text-sm">{STEP_LABEL[b.id] ?? b.label}</span>
                  <span className="tornado-track">
                    <span className="tornado-bar" style={{ left: `${s(lo)}%`, width: `${Math.max(1, s(hi) - s(lo))}%` }} />
                    <span className="tornado-mid" style={{ left: `${s(tor.saving)}%` }} />
                  </span>
                  <span className="text-ink-muted text-xs tabular-nums">{fmtAED(lo)} to {fmtAED(hi)}</span>
                </li>
              );
            })}
          </ul>
        </ChartFrame>
      </div>

      <div className="col-span-12">
        <ChartFrame title="Results in different periods" subtitle={`Typical result of ${backtest.results[0].runs} simulated runs, for each ordering method and period`}
          provenance="PRECOMPUTED"
          note={<>Pick a measure above the table. Each column is an ordering method, from today&apos;s method on the left to the full AI
            on the right; each row is a period, including festivals and disruptions. ★ marks the best method in that period.</>}
          table={<TableView caption="Results in different periods" rows={backtest.windows} columns={[{ key: "w", label: "Period", value: (w) => WINDOW_LABELS[w.id as WindowId] ?? w.label },
            ...backtest.policies.map((p) => ({ key: p.id, label: policyName(p.id), value: (w: BacktestFile["windows"][number]) => kpi(w.id, p.id) ?? "–", numeric: true }))]} />}>
          <div className="w-[260px] mb-3"><Select label="Measure" value={metric} options={METRICS} onChange={setMetric} /></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Table (scrolls if wide)">
            <table className="data-table" data-testid="window-table">
              <thead><tr><th scope="col">Period</th>{backtest.policies.map((p) => <th key={p.id} scope="col" className="num" title={POLICY_HELP[p.id as PolicyId]}>{policyName(p.id)}</th>)}</tr></thead>
              <tbody>{backtest.windows.map((w) => {
                const vals = backtest.policies.map((p) => kpi(w.id, p.id) ?? NaN);
                const best = def.lower ? Math.min(...vals) : Math.max(...vals);
                return (
                  <tr key={w.id}><th scope="row">{WINDOW_LABELS[w.id as WindowId] ?? w.label}</th>
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
      <PageHeader accent="emerald" eyebrow="Cost · Waste · Emissions" title="Impact"
        description="What AI ordering changes in cost, food waste and carbon emissions for a fictional eight-store retailer. The figures come from simulations and are illustrative." />
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

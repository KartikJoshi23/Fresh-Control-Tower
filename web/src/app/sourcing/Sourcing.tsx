"use client";

/**
 * Sourcing (plan §6.1 page 5): rank the nine suppliers with AHP or entropy weights and TOPSIS, see how the ranking
 * moves under Hormuz 2026, and where each supplier's produce travels. Serves R5 (sourcing under disruption) and KQ4.
 */
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ChartFrame, TableView } from "@/components/charts/primitives";
import { RouteGlobe } from "@/components/signature/RouteGlobe";
import { routeViews } from "@/components/signature/routeGeometry";
import { NumberField, Slider } from "@/components/ui/controls";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import type { CatalogFile, McdmFile, RoutesFile } from "@/lib/contracts";
import { useArtefact } from "@/lib/data/hooks";
import { fmtKg } from "@/lib/format";
import { ahp, allocateGreedy, applyScenario, COMPATIBLE, ranks, sensitivity, topsis } from "@/lib/mcdm/mcdm";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

const MODES = [
  { id: "ahp", label: "Board preference", help: "Weights come from the management team comparing the criteria two at a time." },
  { id: "entropy", label: "Data-driven", help: "Criteria on which the suppliers differ most get the most weight." },
  { id: "custom", label: "Your own weights", help: "Set each criterion's weight yourself with the sliders below." },
] as const;

const CONDITIONS = [
  { id: "none", label: "Normal conditions", help: "Every supplier at its usual delivery time and reliability." },
  { id: "hormuz2026", label: "Hormuz 2026 disruption",
    help: "Simulates the 2026 Strait of Hormuz disruption: sea and air importers take longer to deliver and arrive on time far less often." },
] as const;

/** Scores are shown out of 100: 100 = as good as an ideal supplier that is best on every criterion. */
const score100 = (v: number) => Math.round(v * 100);

/** Rank Race: bars re-order with a short transition when weights or conditions change (reduced motion: instant). */
function RankRace({ rows, recommendedId, category }: {
  rows: { id: string; name: string; score: number; rank: number; compatible: boolean }[]; recommendedId: string | null; category: string;
}) {
  const rowH = 38;
  return (
    <div className="rank-race" style={{ height: rows.length * rowH }} role="list" aria-label="Suppliers ranked by score out of 100" data-testid="rank-race">
      {rows.map((r) => (
        <div key={r.id} role="listitem" className="rank-row" data-compatible={r.compatible} data-recommended={r.id === recommendedId}
          style={{ transform: `translateY(${(r.rank - 1) * rowH}px)` }}
          aria-label={`Rank ${r.rank}: ${r.name}, score ${score100(r.score)} out of 100${r.id === recommendedId ? ", recommended" : ""}${r.compatible ? "" : `, cannot supply ${category}`}`}>
          <span className="rank-num tabular-nums">{r.rank}</span>
          <span className="rank-name">{r.name.replace(" (fictional)", "")}</span>
          <span className="rank-track"><span className="rank-bar" style={{ width: `${Math.max(2, r.score * 100)}%` }} /></span>
          <span className="rank-score tabular-nums">{score100(r.score)}</span>
        </div>
      ))}
    </div>
  );
}

function SourcingBody({ mcdm, catalog, routes }: { mcdm: McdmFile; catalog: CatalogFile; routes: RoutesFile }) {
  const scenario = useScenario();
  const set = useScenarioStore((s) => s.set);
  const mode = scenario.sourcing.weightMode;
  const hormuz = scenario.supply.disruptionPreset === "hormuz2026";
  const [custom, setCustom] = useState<number[]>(() => [...mcdm.ahp.weights]);
  const [demandKg, setDemandKg] = useState<number | null>(5000);
  const benefit = useMemo(() => mcdm.criteria.map((c) => c.type === "benefit"), [mcdm]);
  const check = useMemo(() => ahp(mcdm.ahp.matrix), [mcdm]);
  const weights = useMemo(() => {
    const w = mode === "ahp" ? check.weights : mode === "entropy" ? mcdm.entropyWeights : custom;
    const sum = w.reduce((s, v) => s + v, 0) || 1;
    return w.map((v) => v / sum);
  }, [mode, check, mcdm, custom]);
  const x = useMemo(() => applyScenario(mcdm, hormuz ? "hormuz2026" : null), [mcdm, hormuz]);
  const scores = useMemo(() => topsis(x, weights, benefit), [x, weights, benefit]);
  const rk = ranks(scores);
  const sku = catalog.skus.find((s) => s.id === scenario.selection.skuId) ?? catalog.skus[0];
  const category = catalog.categories.find((c) => c.id === sku.categoryId);
  const compatible = new Set(COMPATIBLE[sku.categoryId] ?? []);
  const rows = mcdm.suppliers.map((s, i) => ({ id: s.id, name: s.name, score: scores[i], rank: rk[i], compatible: compatible.has(s.id) }));
  const eligible = rows.filter((r) => r.compatible).sort((a, b) => a.rank - b.rank);
  const recommended = eligible[0] ?? null;
  const sens = useMemo(() => sensitivity(x, weights, benefit), [x, weights, benefit]);
  // Robustness of the pick for THIS SKU: the best-ranked compatible supplier under each perturbation.
  const leaderOf = (r: number[]) => mcdm.suppliers.map((s, i) => [s.id, r[i]] as const).filter(([id]) => compatible.has(id))
    .sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
  const strip = sens.map((s) => ({ ...s, leader: leaderOf(s.ranks), holds: leaderOf(s.ranks) === (recommended?.id ?? null) }));
  const robust = strip.filter((s) => s.holds).length;
  const nameOf = (id: string | null) => mcdm.suppliers.find((s) => s.id === id)?.name.replace(" (fictional)", "") ?? "none";
  const eligibleIdx = mcdm.suppliers.map((s, i) => [s, i] as const).filter(([s]) => compatible.has(s.id));
  const alloc = allocateGreedy(Math.min(demandKg ?? 0, eligibleIdx.reduce((a, [s]) => a + s.capacityPerDay, 0)),
    eligibleIdx.map(([s]) => s.capacityPerDay), eligibleIdx.map(([, i]) => scores[i]));
  const views = routeViews(routes, mcdm, hormuz ? "hormuz2026" : null, recommended?.id ?? null);
  const disruptedChokepoints = new Set(views.filter((v) => v.disrupted).flatMap((v) => v.chokepoints));
  const chokepoints = routes.places.filter((p) => p.kind === "chokepoint")
    .map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, disrupted: hormuz && disruptedChokepoints.has(p.id) }));

  return (
    <>
      <GlassPanel variant="deco" className="col-span-12 p-4 flex flex-col gap-4" data-testid="sourcing-controls">
        <div className="control-group">
          <h2 className="control-group-title"><span className="control-step">1</span>How to weigh what matters</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How to weigh the criteria">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className="preset" onClick={() => set("sourcing.weightMode", m.id)}>{m.label}</button>
            ))}
          </div>
          <p className="text-ink-muted text-sm">{MODES.find((m) => m.id === mode)?.help}</p>
        </div>
        <div className="control-group">
          <h2 className="control-group-title"><span className="control-step">2</span>Supply conditions</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Supply conditions">
            {CONDITIONS.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={(hormuz ? "hormuz2026" : "none") === c.id} className="preset"
                onClick={() => set("supply.disruptionPreset", c.id)}>{c.label}</button>
            ))}
          </div>
          <p className="text-ink-muted text-sm">{CONDITIONS.find((c) => c.id === (hormuz ? "hormuz2026" : "none"))?.help}</p>
        </div>
      </GlassPanel>
      <GlassPanel variant="chart" className="col-span-12 p-4 recommendation">
        <p className="text-ink-secondary" data-testid="sourcing-recommendation">
          <span className="stat-label block mb-1">Recommendation</span>
          For <strong className="text-ink">{sku.name}</strong> ({category?.name.toLowerCase()}), buy from{" "}
          <strong className="text-ink">{recommended?.name.replace(" (fictional)", "") ?? "no supplier that stocks it"}</strong>
          {recommended ? `: it ranks ${recommended.rank} of ${rows.length} overall and first among the suppliers that can supply ${category?.name.toLowerCase()}.` : "."}
          {" "}Change the item with the Scenario button (top right).
        </p>
      </GlassPanel>

      <div className="col-span-12 xl:col-span-7">
        <ChartFrame title="Supplier ranking" subtitle={`Score out of 100, higher is better. Faded suppliers cannot supply ${category?.name.toLowerCase()}.`}
          provenance="CALIBRATED_SYNTHETIC"
          note={<>The score measures how close each supplier comes to an imaginary ideal one that is best on all seven criteria
            (100 would match it exactly), using the weights on the right. The bars re-order when you change the weights or the conditions.</>}
          table={<TableView caption="Supplier ranking" rows={[...rows].sort((a, b) => a.rank - b.rank)} columns={[
            { key: "r", label: "Rank", value: (r) => r.rank, numeric: true }, { key: "n", label: "Supplier", value: (r) => r.name },
            { key: "s", label: "Score (out of 100)", value: (r) => +(r.score * 100).toFixed(1), numeric: true },
            { key: "c", label: `Supplies ${category?.name.toLowerCase()}`, value: (r) => (r.compatible ? "Yes" : "No") }]} />}>
          <RankRace rows={rows} recommendedId={recommended?.id ?? null} category={category?.name.toLowerCase() ?? ""} />
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
        <ChartFrame title="How much each criterion counts" subtitle={mode === "ahp"
          ? `From the management team's comparisons. Their judgements pass the consistency check (${check.cr.toFixed(3)}; under 0.10 counts as consistent).`
          : mode === "entropy" ? "Criteria on which the suppliers differ most get the most weight" : "Drag the sliders; the weights always add up to 100%"}
          provenance={mode === "custom" ? "SCENARIO" : "CALIBRATED_SYNTHETIC"}
          table={<TableView caption="Weights" rows={mcdm.criteria.map((c, i) => ({ c, w: weights[i] }))} columns={[
            { key: "c", label: "Criterion", value: (r) => r.c.label }, { key: "u", label: "Measured in", value: (r) => r.c.unit },
            { key: "t", label: "Better when", value: (r) => (r.c.type === "cost" ? "lower" : "higher") },
            { key: "w", label: "Weight (%)", value: (r) => +(r.w * 100).toFixed(1), numeric: true }]} />}>
          {mode === "custom" ? (
            <div className="flex flex-col gap-2">
              {mcdm.criteria.map((c, i) => (
                <Slider key={c.id} label={`${c.label} (${c.unit}; ${c.type === "cost" ? "lower is better" : "higher is better"})`} value={custom[i]} min={0} max={0.6} step={0.01}
                  format={() => `${(weights[i] * 100).toFixed(0)}%`} onChange={(v) => setCustom((w) => w.map((o, j) => (j === i ? v : o)))} />
              ))}
            </div>
          ) : (
            <ul className="weight-list">
              {mcdm.criteria.map((c, i) => (
                <li key={c.id}>
                  <span className="text-ink-secondary" title={`Measured in ${c.unit}; ${c.type === "cost" ? "lower" : "higher"} is better`}>{c.label}</span>
                  <span className="rank-track"><span className="rank-bar" style={{ width: `${weights[i] * 100 / Math.max(...weights)}%` }} /></span>
                  <span className="tabular-nums text-ink">{(weights[i] * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>
        <GlassPanel variant="deco" className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2"><h3 className="text-ink font-semibold">Split a day&apos;s order between suppliers</h3><ProvenanceChip provenance="SCENARIO" /></div>
          <p className="text-ink-muted text-sm">The best-ranked suppliers that can supply {category?.name.toLowerCase()} are filled first, up to the kilograms each can deliver per day.</p>
          <NumberField label="Kilograms per day" value={demandKg} min={0} max={50000} step={100} onChange={setDemandKg} />
          <ul className="text-sm flex flex-col gap-1" data-testid="allocation">
            {eligibleIdx.map(([s], k) => (
              <li key={s.id} className="flex justify-between gap-2"><span className="text-ink-secondary">{s.name.replace(" (fictional)", "")}</span>
                <span className="tabular-nums text-ink">{fmtKg(alloc[k])} of {fmtKg(s.capacityPerDay)} a day</span></li>
            ))}
          </ul>
        </GlassPanel>
      </div>

      <div className="col-span-12">
        <ChartFrame title="How firm is the recommendation?" subtitle={`Each criterion's weight nudged 20% down and 20% up: ${nameOf(recommended?.id ?? null)} stays the pick for ${sku.name.toLowerCase()} in ${robust} of ${strip.length} cases`}
          provenance="SCENARIO"
          note={<><strong>✓</strong> the recommendation stays the same; <strong>✕</strong> another supplier would take over (named). Many ticks
            mean the choice does not hinge on exactly how the criteria are weighed.</>}
          table={<TableView caption="Sensitivity" rows={strip} columns={[{ key: "c", label: "Criterion", value: (s) => mcdm.criteria[s.criterion].label },
            { key: "d", label: "Weight changed by", value: (s) => `${s.change > 0 ? "+" : "−"}20%` },
            { key: "t", label: `Pick for ${sku.name.toLowerCase()}`, value: (s) => (s.holds ? "Unchanged" : nameOf(s.leader)) }]} />}>
          <div className="sens-strip" data-testid="sensitivity-strip">
            {mcdm.criteria.map((c, j) => (
              <div key={c.id} className="sens-cell">
                <span className="text-ink-secondary text-sm">{c.label}</span>
                <div className="flex flex-col gap-1">
                  {strip.filter((s) => s.criterion === j).map((s) => (
                    <span key={s.change} className="sens-mark" style={{ color: `var(--status-${s.holds ? "good" : "warning"})` }}
                      title={s.holds ? "Pick unchanged" : `New pick: ${nameOf(s.leader)}`}>
                      {s.holds ? <Check aria-hidden="true" size={14} /> : <X aria-hidden="true" size={14} />}
                      <span className="text-ink-secondary text-xs">{s.change > 0 ? "+" : "−"}20%{s.holds ? "" : `: ${nameOf(s.leader)}`}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ChartFrame>
      </div>

      <div className="col-span-12">
        <ChartFrame title="Where the produce comes from" subtitle={hormuz ? "Hormuz 2026 disruption: sea and air routes take longer and arrive on time far less often (shown in red)" : "The route each supplier's produce takes to the UAE stores"}
          provenance="CALIBRATED_SYNTHETIC"
          note={<>In the 3D view, drag to turn the globe. Solid lines are trucks, dashed lines ships and dotted lines flights; the thicker line is the
            recommended supplier. Routes are simplified straight legs between the named places, not exact shipping lanes.</>}
          table={<TableView caption="Routes" rows={views} columns={[{ key: "s", label: "Supplier", value: (v) => v.supplierName },
            { key: "m", label: "Transport", value: (v) => ({ local_truck: "Local truck", truck: "Truck (GCC)", sea: "Ship", air: "Air freight" } as const)[v.mode] },
            { key: "p", label: "Route", value: (v) => v.points.map((p) => p.name).join(" → ") },
            { key: "d", label: "Status", value: (v) => (v.disrupted ? "Disrupted" : "Normal") }]} />}>
          <RouteGlobe routes={views} chokepoints={chokepoints} />
        </ChartFrame>
      </div>
    </>
  );
}

export function Sourcing() {
  const mcdm = useArtefact("mcdm.json");
  const catalog = useArtefact("catalog.json");
  const routes = useArtefact("routes.json");
  return (
    <div className="page-grid py-6">
      <PageHeader accent="sky" eyebrow="Supplier choice · seven criteria" title="Sourcing"
        description="Nine fictional suppliers scored on seven criteria such as cost, delivery time and reliability. Choose how the criteria are weighed and the supply conditions, and watch the ranking change." />
      <DataState result={mcdm} what="supplier scores" minHeight={400}>
        {(m) => (
          <DataState result={catalog} what="the catalogue">
            {(c) => <DataState result={routes} what="routes">{(r) => <SourcingBody mcdm={m} catalog={c} routes={r} />}</DataState>}
          </DataState>
        )}
      </DataState>
    </div>
  );
}

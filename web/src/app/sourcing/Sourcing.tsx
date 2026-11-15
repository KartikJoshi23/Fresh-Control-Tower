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
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import type { CatalogFile, McdmFile, RoutesFile } from "@/lib/contracts";
import { useArtefact } from "@/lib/data/hooks";
import { fmtInt } from "@/lib/format";
import { ahp, allocateGreedy, applyScenario, COMPATIBLE, ranks, sensitivity, topsis } from "@/lib/mcdm/mcdm";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

const MODES = [
  { id: "ahp", label: "Board preference (AHP)" },
  { id: "entropy", label: "Data-driven (entropy)" },
  { id: "custom", label: "Your weights" },
] as const;

/** Rank Race: bars re-order with a short transition when weights or conditions change (reduced motion: instant). */
function RankRace({ rows, recommendedId, category }: {
  rows: { id: string; name: string; score: number; rank: number; compatible: boolean }[]; recommendedId: string | null; category: string;
}) {
  const rowH = 38;
  return (
    <div className="rank-race" style={{ height: rows.length * rowH }} role="list" aria-label="Suppliers ranked by TOPSIS closeness" data-testid="rank-race">
      {rows.map((r) => (
        <div key={r.id} role="listitem" className="rank-row" data-compatible={r.compatible} data-recommended={r.id === recommendedId}
          style={{ transform: `translateY(${(r.rank - 1) * rowH}px)` }}
          aria-label={`Rank ${r.rank}: ${r.name}, closeness ${r.score.toFixed(3)}${r.id === recommendedId ? ", recommended" : ""}${r.compatible ? "" : `, cannot supply ${category}`}`}>
          <span className="rank-num tabular-nums">{r.rank}</span>
          <span className="rank-name">{r.name.replace(" (fictional)", "")}</span>
          <span className="rank-track"><span className="rank-bar" style={{ width: `${Math.max(2, r.score * 100)}%` }} /></span>
          <span className="rank-score tabular-nums">{r.score.toFixed(3)}</span>
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
      <GlassPanel variant="deco" className="col-span-12 p-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Weights">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className="preset" onClick={() => set("sourcing.weightMode", m.id)}>{m.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Conditions">
          {([["none", "Normal conditions"], ["hormuz2026", "Hormuz 2026"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={scenario.supply.disruptionPreset === id} className="preset"
              onClick={() => set("supply.disruptionPreset", id)}>{label}</button>
          ))}
        </div>
        <p className="text-ink-secondary text-sm grow" data-testid="sourcing-recommendation">
          For <strong className="text-ink">{sku.name}</strong> ({category?.name.toLowerCase()}), buy from{" "}
          <strong className="text-ink">{recommended?.name.replace(" (fictional)", "") ?? "no compatible supplier"}</strong>
          {recommended ? ` (rank ${recommended.rank} of ${rows.length} overall)` : ""}.
        </p>
      </GlassPanel>

      <div className="col-span-12 xl:col-span-7">
        <ChartFrame title="Rank Race" subtitle={`TOPSIS closeness to the ideal supplier (1 = ideal). Muted bars cannot supply ${category?.name.toLowerCase()}.`}
          provenance="CALIBRATED_SYNTHETIC"
          table={<TableView caption="Supplier ranking" rows={[...rows].sort((a, b) => a.rank - b.rank)} columns={[
            { key: "r", label: "Rank", value: (r) => r.rank, numeric: true }, { key: "n", label: "Supplier", value: (r) => r.name },
            { key: "s", label: "Closeness", value: (r) => r.score.toFixed(4), numeric: true },
            { key: "c", label: `Supplies ${category?.name.toLowerCase()}`, value: (r) => (r.compatible ? "Yes" : "No") }]} />}>
          <RankRace rows={rows} recommendedId={recommended?.id ?? null} category={category?.name.toLowerCase() ?? ""} />
        </ChartFrame>
      </div>

      <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
        <ChartFrame title="Criterion weights" subtitle={mode === "ahp"
          ? `AHP on the board's pairwise judgements: λmax ${check.lambdaMax.toFixed(3)}, CR ${check.cr.toFixed(3)} (consistent below 0.10)`
          : mode === "entropy" ? "Shannon entropy: criteria where suppliers differ most get the most weight" : "Drag to set your own; weights are rescaled to sum to 1"}
          provenance={mode === "custom" ? "SCENARIO" : "CALIBRATED_SYNTHETIC"}
          table={<TableView caption="Weights" rows={mcdm.criteria.map((c, i) => ({ c, w: weights[i] }))} columns={[
            { key: "c", label: "Criterion", value: (r) => r.c.label }, { key: "t", label: "Type", value: (r) => r.c.type },
            { key: "w", label: "Weight", value: (r) => r.w.toFixed(3), numeric: true }]} />}>
          {mode === "custom" ? (
            <div className="flex flex-col gap-2">
              {mcdm.criteria.map((c, i) => (
                <Slider key={c.id} label={`${c.label} (${c.type === "cost" ? "lower is better" : "higher is better"})`} value={custom[i]} min={0} max={0.6} step={0.01}
                  format={() => `${(weights[i] * 100).toFixed(0)}%`} onChange={(v) => setCustom((w) => w.map((o, j) => (j === i ? v : o)))} />
              ))}
            </div>
          ) : (
            <ul className="weight-list">
              {mcdm.criteria.map((c, i) => (
                <li key={c.id}>
                  <span className="text-ink-secondary">{c.label}</span>
                  <span className="rank-track"><span className="rank-bar" style={{ width: `${weights[i] * 100 / Math.max(...weights)}%` }} /></span>
                  <span className="tabular-nums text-ink">{(weights[i] * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>
        <GlassPanel variant="deco" className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2"><h3 className="text-ink font-semibold">Split a day&apos;s order</h3><ProvenanceChip provenance="SCENARIO" /></div>
          <p className="text-ink-muted text-sm">Fill the best-ranked compatible suppliers first, up to each one&apos;s daily capacity.</p>
          <NumberField label="Kilograms per day" value={demandKg} min={0} max={50000} step={100} onChange={setDemandKg} />
          <ul className="text-sm flex flex-col gap-1" data-testid="allocation">
            {eligibleIdx.map(([s], k) => (
              <li key={s.id} className="flex justify-between gap-2"><span className="text-ink-secondary">{s.name.replace(" (fictional)", "")}</span>
                <span className="tabular-nums text-ink">{fmtInt(alloc[k])} kg of {fmtInt(s.capacityPerDay)}</span></li>
            ))}
          </ul>
        </GlassPanel>
      </div>

      <div className="col-span-12">
        <ChartFrame title="How robust is the top pick?" subtitle={`Each weight moved ±20% (the others rescaled): ${nameOf(recommended?.id ?? null)} stays the pick for ${sku.name.toLowerCase()} in ${robust} of ${strip.length} cases`}
          provenance="SCENARIO"
          table={<TableView caption="Sensitivity" rows={strip} columns={[{ key: "c", label: "Criterion", value: (s) => mcdm.criteria[s.criterion].label },
            { key: "d", label: "Change", value: (s) => `${s.change > 0 ? "+" : "−"}20%` },
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
        <ChartFrame title="Route Globe" subtitle={hormuz ? "Hormuz 2026: routes through the strait, and air imports, run late and short" : "Where each supplier's produce comes from"}
          provenance="CALIBRATED_SYNTHETIC"
          table={<TableView caption="Routes" rows={views} columns={[{ key: "s", label: "Supplier", value: (v) => v.supplierName },
            { key: "m", label: "Mode", value: (v) => v.mode.replace("_", " ") }, { key: "p", label: "Via", value: (v) => v.points.map((p) => p.name).join(" → ") },
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
      <header className="col-span-12 flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Sourcing</h1>
        <p className="text-ink-secondary max-w-3xl">Nine fictional suppliers scored on seven criteria. Change the weights or the conditions and watch the ranking re-order.</p>
      </header>
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

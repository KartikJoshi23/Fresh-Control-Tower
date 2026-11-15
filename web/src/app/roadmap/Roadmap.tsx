"use client";

/**
 * Roadmap (plan §6.1 page 7): business model, phased rollout, partners, risk register (plan §14.2), and the
 * Methods & Data tab (workflow, provenance, model cards, sources, the KQ2 duplication note). Serves C2–C5, S3, R6.
 * No invented figures: costs of the rollout are not estimated here; results quoted come from the artefacts.
 */
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { GlideIndicator, useGlide } from "@/components/motion/Glide";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import type { BacktestFile, ImpactFile, MetaFile, Provenance } from "@/lib/contracts";
import { useArtefact } from "@/lib/data/hooks";
import { change, fmtAED, fmtSignedPct } from "@/lib/format";
import { withQuery } from "@/components/layout/nav";
import { useScenario } from "@/lib/state/scenarioStore";
import { encodeScenario } from "@/lib/state/scenario";

const REPO = "https://github.com/KartikJoshi23/Fresh-Control-Tower/blob/main";

/** Plan §14.2, with where each mitigation shows in this product. */
export const RISKS = [
  { risk: "Model drift at festivals", mitigation: "Moving-holiday features, monitoring, human override", where: "Demand Lab (festival bands), Scenario Studio (manual order)" },
  { risk: "Poor stock-record quality (phantom stock)", mitigation: "Cycle counts and an anomaly flag", where: "Live Ops alert stream" },
  { risk: "Over-automation", mitigation: "Approval modes and guardrails (order-value caps, approve-exceptions mode)", where: "Live Ops purchase-order log" },
  { risk: "Cold-chain failure", mitigation: "Supplier quality criterion; freshness-on-arrival tracking", where: "Sourcing (quality rejects, freshness criteria)" },
  { risk: "Chokepoint disruption", mitigation: "Sourcing mix, regional and local capacity, strategic buffers for long-life items", where: "Sourcing (Hormuz 2026), Route Globe" },
  { risk: "Supplier lock-in", mitigation: "Multi-sourcing", where: "Sourcing (order split across compatible suppliers)" },
  { risk: "Change management (store and buying teams)", mitigation: "Pilot with champions; explainable recommendations", where: "Overview recommendation, provenance chips" },
  { risk: "Data privacy", mitigation: "No personal data used; aggregate store-level only", where: "Methods & Data" },
] as const;

const PHASES = [
  { name: "Pilot", scope: "Two dark stores, ten hero SKUs", what: "Demand recovery and the AI daily order (P1) beside the buyers' own orders; the Live Ops view on a real feed.",
    gate: "Fill rate up and waste per unit sold no worse than the legacy rule, over at least one festival period." },
  { name: "Scale", scope: "All stores, the full fresh range", what: "Noon top-up channel (P2) with the wholesale market; approval modes tuned with the store teams.",
    gate: "Lost sales down across the stress windows; approvals stay within the agreed exception rate." },
  { name: "Network", scope: "Buying and supplier management", what: "Multi-criteria sourcing (P3) with disruption scenarios; supplier data feeds for lead time and quality.",
    gate: "Availability holds through a supply disruption without emergency air freight becoming the norm." },
] as const;

const PARTNERS = [
  { group: "Data and systems", items: ["Point-of-sale and stock records (store level)", "Warehouse and ordering system", "Weather forecasts (Open-Meteo in this prototype)"] },
  { group: "Suppliers", items: ["UAE farms and bakeries", "GCC overland suppliers", "Sea and air importers"] },
  { group: "Logistics", items: ["Same-day wholesale-market top-ups", "Cold-chain carriers"] },
  { group: "Food rescue", items: ["Food-bank and food-rescue partners for expiring stock"] },
] as const;

const MODELS = [
  { step: "1 · Recover hidden demand", method: "Intraday sales profiles fill the hours a shelf was empty (profile recovery; a gradient-boosting alternative was tested and rejected).",
    evidence: "Masking test on real FreshRetailNet-50K data. Recovery WAPE 30.5%, short of the 25% target (reported, not hidden).", page: "/demand/" },
  { step: "2 · Forecast", method: "Quantile gradient boosting (P10/P50/P90) with direct horizons, compared with exponential smoothing; Poisson CUSUM for unannounced spikes.",
    evidence: "On real data, training on recovered demand moves forecast bias from −18.9% to −0.4%. Item-level spike alarms lag by about 7 hours.", page: "/demand/" },
  { step: "3 · Optimise", method: "Order-up-to level at an optimised service quantile τ per SKU, capped by sellable shelf life; noon top-up; 200-run paired Monte Carlo backtests.",
    evidence: "At equal availability the AI wastes about 41% less. In absolute kilograms it wastes more, because it now serves the demand empty shelves hid.", page: "/impact/" },
  { step: "4 · Source", method: "AHP board weights (CR 0.025) or entropy weights, TOPSIS ranking, sensitivity, capacity-aware split.",
    evidence: "Reproduces a published TOPSIS example to 6 decimals; the browser matches the Python pipeline to 1e-6.", page: "/sourcing/" },
] as const;

function Plan({ impact, backtest }: { impact: ImpactFile; backtest: BacktestFile }) {
  const base = impact.waterfall[0].valueAED;
  const ai = impact.waterfall.at(-1)!.valueAED;
  const k = (p: string) => backtest.results.find((r) => r.windowId === "test-2026" && r.policyId === p)?.kpis;
  const p0 = k("P0");
  const p3 = k("P3");
  return (
    <>
      <GlassPanel variant="deco" className="col-span-12 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-ink">The business-model shift</h2>
          <ProvenanceChip provenance="PRECOMPUTED" />
        </div>
        <div className="shift-grid">
          <div>
            <h3 className="stat-label">Today: the legacy rule</h3>
            <ul className="bullet-list">
              <li>Orders follow recorded sales plus a fixed 20% buffer.</li>
              <li>Empty shelves record zero sales, so lost demand looks like low demand.</li>
              <li>One review a day; one primary supplier per item.</li>
              <li>Waste and stockouts are found after the fact.</li>
            </ul>
          </div>
          <ArrowRight aria-hidden="true" className="shift-arrow" />
          <div>
            <h3 className="stat-label">With the control tower</h3>
            <ul className="bullet-list">
              <li>Demand recovered from stockout hours, forecast as a range.</li>
              <li>Order levels set by a service target and capped by shelf life.</li>
              <li>A noon top-up when the morning shows a shortfall.</li>
              <li>Suppliers ranked on cost, speed, reliability, freshness and exposure; people approve the exceptions.</li>
            </ul>
          </div>
        </div>
        {p0 && p3 ? (
          <p className="text-ink-secondary text-sm" data-testid="shift-result">
            In the Jan–Oct 2026 backtest (fictional operator, median of {backtest.results[0].runs} runs): fill rate {p0.fillRatePct.p50.toFixed(1)}% → {p3.fillRatePct.p50.toFixed(1)}%,
            total cost {fmtSignedPct(change(p3.totalCostAED.p50, p0.totalCostAED.p50), 0)}; annualised cost {fmtAED(base)} → {fmtAED(ai)}.
          </p>
        ) : null}
      </GlassPanel>

      <section className="col-span-12 flex flex-col gap-3" aria-labelledby="phases">
        <h2 id="phases" className="text-xl font-semibold text-ink">Phased rollout</h2>
        <ol className="phase-grid">
          {PHASES.map((p, i) => (
            <li key={p.name}>
              <GlassPanel variant="chart" className="p-4 h-full flex flex-col gap-2">
                <span className="stat-label">Phase {i + 1}</span>
                <h3 className="text-lg font-semibold text-ink">{p.name}</h3>
                <p className="text-ink-secondary text-sm"><strong className="text-ink">Scope:</strong> {p.scope}</p>
                <p className="text-ink-secondary text-sm"><strong className="text-ink">Invest in:</strong> {p.what}</p>
                <p className="text-ink-secondary text-sm"><strong className="text-ink">Gate to the next phase:</strong> {p.gate}</p>
              </GlassPanel>
            </li>
          ))}
        </ol>
        <p className="text-ink-muted text-xs">The prototype does not estimate rollout costs: there is no sourced basis for them yet.</p>
      </section>

      <GlassPanel variant="deco" className="col-span-12 xl:col-span-5 p-5 flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Partners</h2>
        <div className="partner-grid">
          {PARTNERS.map((g) => (
            <div key={g.group}>
              <h3 className="stat-label">{g.group}</h3>
              <ul className="flex flex-wrap gap-2 mt-2">{g.items.map((it) => <li key={it} className="scenario-chip">{it}</li>)}</ul>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel variant="chart" className="col-span-12 xl:col-span-7 p-5 flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Risk register</h2>
        <div className="table-scroll table-full" tabIndex={0} role="region" aria-label="Risk register (scrolls if wide)">
          <table className="data-table" data-testid="risk-register">
            <thead><tr><th scope="col">Risk</th><th scope="col">Mitigation</th><th scope="col">Where it shows</th></tr></thead>
            <tbody>{RISKS.map((r) => <tr key={r.risk}><th scope="row" className="text-ink">{r.risk}</th><td>{r.mitigation}</td><td className="text-ink-secondary">{r.where}</td></tr>)}</tbody>
          </table>
        </div>
      </GlassPanel>
    </>
  );
}

function Methods({ meta }: { meta: MetaFile }) {
  const scenario = useScenario();
  const query = encodeScenario(scenario);
  const sources = meta.sourcesCatalog.filter((s) => s.id !== "fixture-placeholder");
  const legend = Object.entries(meta.provenanceLegend) as [Provenance, string][];
  const date = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <>
      <section className="col-span-12 flex flex-col gap-3" aria-labelledby="workflow">
        <h2 id="workflow" className="text-xl font-semibold text-ink">How the AI works: four steps</h2>
        <ol className="phase-grid phase-grid-4">
          {MODELS.map((m) => (
            <li key={m.step}>
              <GlassPanel variant="chart" className="p-4 h-full flex flex-col gap-2">
                <h3 className="font-semibold text-ink">{m.step}</h3>
                <p className="text-ink-secondary text-sm">{m.method}</p>
                <p className="text-ink-secondary text-sm"><strong className="text-ink">Evidence:</strong> {m.evidence}</p>
                <Link className="text-sm link" href={withQuery(m.page, query)}>See it on the page</Link>
              </GlassPanel>
            </li>
          ))}
        </ol>
        <p className="text-ink-secondary text-sm">
          Method notes: <a className="link" href={`${REPO}/docs/04-synthetic-world.md`}>synthetic world</a> ·{" "}
          <a className="link" href={`${REPO}/docs/05-models.md`}>models</a> · <a className="link" href={`${REPO}/docs/06-decisions.md`}>decisions</a>.
          The brief lists KQ2 (&ldquo;what data is essential, and why&rdquo;) twice; it is answered once, on the Demand Lab&apos;s &ldquo;What data matters&rdquo; tab.
        </p>
      </section>

      <GlassPanel variant="chart" className="col-span-12 xl:col-span-5 p-5 flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Where each number comes from</h2>
        <ul className="flex flex-col gap-3" data-testid="provenance-legend">
          {legend.map(([p, text]) => <li key={p} className="flex flex-col items-start gap-1"><ProvenanceChip provenance={p} /><span className="text-ink-secondary text-sm">{text}</span></li>)}
        </ul>
        <p className="text-ink-muted text-xs">{meta.operatorName}: {meta.operatorIsFictional ? "a fictional operator; no real company's data is used." : ""} No personal data is used anywhere.</p>
      </GlassPanel>

      <GlassPanel variant="chart" className="col-span-12 xl:col-span-7 p-5 flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Sources</h2>
        <ol className="source-list" data-testid="sources">
          {sources.map((s) => (
            <li key={s.id}>
              {s.citation}.{s.url ? <> Available at: <a className="link break-all" href={s.url} rel="noreferrer" target="_blank">{s.url}</a></> : null} (Accessed: {date(s.accessed)}). {s.licence}.{s.verified ? "" : " (To be verified.)"}
            </li>
          ))}
        </ol>
      </GlassPanel>
    </>
  );
}

export function Roadmap() {
  const [tab, setTab] = useState<"plan" | "methods">("plan");
  const meta = useArtefact("meta.json");
  const impact = useArtefact("impact.json");
  const backtest = useArtefact("backtest.json");
  const [tabsRef, glide] = useGlide<HTMLDivElement>('[aria-selected="true"]', [tab]);
  return (
    <div className="page-grid py-6">
      <PageHeader eyebrow="Adoption · Risks · Methods" title="Roadmap"
        description="How an operator would adopt the control tower, what could go wrong, and how every number in this prototype was made.">
        <div ref={tabsRef} className="tablist" role="tablist" aria-label="Roadmap sections" data-glide={glide ? "" : undefined}>
          <GlideIndicator box={glide} className="tab-indicator" />
          {([["plan", "Roadmap"], ["methods", "Methods & Data"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1} className="tab" onClick={() => setTab(id)}
              onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") setTab(tab === "plan" ? "methods" : "plan"); }}>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </PageHeader>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="col-span-12 page-grid">
        {tab === "plan" ? (
          <DataState result={impact} what="the impact summary">
            {(i) => <DataState result={backtest} what="the backtest">{(b) => <Plan impact={i} backtest={b} />}</DataState>}
          </DataState>
        ) : (
          <DataState result={meta} what="sources">{(m) => <Methods meta={m} />}</DataState>
        )}
      </div>
    </div>
  );
}

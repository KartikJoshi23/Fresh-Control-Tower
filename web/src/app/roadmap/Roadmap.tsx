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
import { PROVENANCE } from "@/lib/data/provenance";
import { change, fmtAED, fmtDate } from "@/lib/format";
import { policyName } from "@/lib/labels";
import { withQuery } from "@/components/layout/nav";
import { useScenario } from "@/lib/state/scenarioStore";
import { encodeScenario } from "@/lib/state/scenario";

const REPO = "https://github.com/KartikJoshi23/Fresh-Control-Tower/blob/main";

/** Plan §14.2 in plain words, with where each safeguard shows in this product. */
export const RISKS = [
  { risk: "Forecasts go wrong at festivals", mitigation: "Festival dates built into the forecast, monitoring, and people can override any order",
    where: "Demand Lab (festival bands), Scenario Studio (extra order by hand)" },
  { risk: "Stock records are wrong (the system shows stock that is not on the shelf)", mitigation: "Regular shelf counts and an alert when sales stop unexpectedly",
    where: "Live Ops alerts" },
  { risk: "Too much automation", mitigation: "Approval settings and limits: unusual orders wait for a person or are blocked",
    where: "Live Ops purchase orders" },
  { risk: "Cold chain fails and food arrives spoiled", mitigation: "Suppliers scored on quality rejects and freshness on arrival",
    where: "Sourcing (quality and freshness criteria)" },
  { risk: "A shipping route is cut (for example the Strait of Hormuz)", mitigation: "A mix of local, regional and overseas suppliers, and extra stock of long-life items",
    where: "Sourcing (Hormuz 2026 conditions, route globe)" },
  { risk: "Depending on a single supplier", mitigation: "Buying each item from more than one supplier", where: "Sourcing (order split between suppliers)" },
  { risk: "Store and buying teams do not adopt it", mitigation: "Start with a pilot and local champions; every recommendation explains itself",
    where: "Overview recommendation, data-source labels on every chart" },
  { risk: "Data privacy", mitigation: "No personal data is used; only store-level totals", where: "Methods & Data" },
] as const;

const PHASES = [
  { name: "Pilot", scope: "Two stores, ten key items", what: `AI demand recovery and "${policyName("P1")}" run beside the buyers' own orders; the Live Ops view on a real data feed.`,
    gate: "More customer demand met, and no more waste per unit sold than today, over at least one festival period." },
  { name: "Scale", scope: "All stores, the whole fresh range", what: `"${policyName("P2")}" with the wholesale market; approval settings agreed with the store teams.`,
    gate: "Fewer missed sales in every test period, including festivals; the share of orders needing approval stays within the agreed limit." },
  { name: "Network", scope: "Buying and supplier management", what: `"${policyName("P3")}" with disruption planning; live supplier data on delivery times and quality.`,
    gate: "Shelves stay stocked through a supply disruption without emergency air freight becoming routine." },
] as const;

const PARTNERS = [
  { group: "Data and systems", items: ["Till and stock records (store level)", "Warehouse and ordering system", "Weather forecasts (Open-Meteo in this prototype)"] },
  { group: "Suppliers", items: ["UAE farms and bakeries", "GCC suppliers by road", "Sea and air importers"] },
  { group: "Logistics", items: ["Same-day top-ups from the wholesale market", "Refrigerated (cold-chain) carriers"] },
  { group: "Food rescue", items: ["Food-bank and food-rescue partners for food near its expiry date"] },
] as const;

const MODELS = [
  { step: "1 · Find the hidden demand", method: "When a shelf was empty, the AI estimates what would have sold from the item's usual sales pattern for those hours.",
    evidence: "Tested on real grocery data (FreshRetailNet-50K) by hiding sales we know and checking the estimate: off by about 30% on a typical day, short of our 25% target. We report this rather than hide it.",
    technique: "Intraday profile recovery; a machine-learning alternative was tested and rejected.", page: "/demand/" },
  { step: "2 · Forecast demand", method: "Predicts each item's daily demand up to five weeks ahead as a likely range, and raises an alarm when sales suddenly jump.",
    evidence: "On real data, learning from the recovered demand instead of till sales turns a forecast that ran 18.9% too low into one that is right on average (0.4% low). Spike alarms for a single item come about 7 hours after the spike starts.",
    technique: "Quantile gradient boosting, compared with exponential smoothing; a CUSUM alarm for spikes.", page: "/demand/" },
  { step: "3 · Decide how much to order", method: "Orders enough for the forecast plus safety stock, never more than can be sold before it expires, and tops up at midday when needed.",
    evidence: "Over 200 simulated runs, at the same shelf availability the AI throws away about 41% less. In total kilograms it throws away more, because it now sells the demand that empty shelves hid.",
    technique: "Order-up-to policy with a tuned service level and a shelf-life cap; paired Monte Carlo simulations.", page: "/impact/" },
  { step: "4 · Choose suppliers", method: "Scores suppliers on seven criteria, with weights set by management or by the data, and checks how firm the choice is.",
    evidence: "It reproduces a published worked example to six decimal places, and the dashboard agrees with the Python model to within 0.000001.",
    technique: "AHP weights (consistency 0.025) or entropy weights; TOPSIS ranking.", page: "/sourcing/" },
] as const;

function Plan({ impact, backtest }: { impact: ImpactFile; backtest: BacktestFile }) {
  const base = impact.waterfall[0].valueAED;
  const ai = impact.waterfall.at(-1)!.valueAED;
  const k = (p: string) => backtest.results.find((r) => r.windowId === "test-2026" && r.policyId === p)?.kpis;
  const p0 = k("P0");
  const p3 = k("P3");
  return (
    <>
      <GlassPanel variant="chart" className="col-span-12 p-5 flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Risk register</h2>
        <p className="text-ink-secondary text-sm">What could go wrong when a retailer adopts AI ordering, how each risk is reduced, and where you can see that safeguard in this dashboard.</p>
        <div className="table-scroll table-full" tabIndex={0} role="region" aria-label="Risk register (scrolls if wide)">
          <table className="data-table" data-testid="risk-register">
            <thead><tr><th scope="col">Risk</th><th scope="col">How we reduce it</th><th scope="col">Where it shows in the dashboard</th></tr></thead>
            <tbody>{RISKS.map((r) => <tr key={r.risk}><th scope="row" className="text-ink">{r.risk}</th><td>{r.mitigation}</td><td className="text-ink-secondary">{r.where}</td></tr>)}</tbody>
          </table>
        </div>
      </GlassPanel>

      <GlassPanel variant="deco" className="col-span-12 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-ink">How the business changes</h2>
          <ProvenanceChip provenance="PRECOMPUTED" />
        </div>
        <div className="shift-grid">
          <div>
            <h3 className="stat-label">Today: the current method</h3>
            <ul className="bullet-list">
              <li>Orders follow what sold recently, plus a fixed 20% extra.</li>
              <li>An empty shelf records zero sales, so missed demand looks like low demand.</li>
              <li>One order a day, from one main supplier per item.</li>
              <li>Waste and empty shelves are only noticed afterwards.</li>
            </ul>
          </div>
          <ArrowRight aria-hidden="true" className="shift-arrow" />
          <div>
            <h3 className="stat-label">With the control tower</h3>
            <ul className="bullet-list">
              <li>Demand hidden by empty shelves is recovered and forecast as a likely range.</li>
              <li>Order sizes follow a chosen stock level and never exceed what can be sold before it expires.</li>
              <li>A midday top-up when the morning&apos;s sales show the shelf will run out.</li>
              <li>Suppliers ranked on cost, speed, reliability, freshness and risk; people approve the unusual orders.</li>
            </ul>
          </div>
        </div>
        {p0 && p3 ? (
          <p className="text-ink-secondary text-sm" data-testid="shift-result">
            In the simulated test period (1 Jan to 31 Oct 2026, a fictional retailer, typical result of {backtest.results[0].runs} runs): customer demand met
            rises from {p0.fillRatePct.p50.toFixed(1)}% to {p3.fillRatePct.p50.toFixed(1)}% and total cost falls by {Math.abs(change(p3.totalCostAED.p50, p0.totalCostAED.p50)).toFixed(0)}%;
            the yearly cost of stock goes from {fmtAED(base)} to {fmtAED(ai)}.
          </p>
        ) : null}
      </GlassPanel>

      <section className="col-span-12 flex flex-col gap-3" aria-labelledby="phases">
        <h2 id="phases" className="text-xl font-semibold text-ink">Rollout in three phases</h2>
        <ol className="phase-grid">
          {PHASES.map((p, i) => (
            <li key={p.name}>
              <GlassPanel variant="chart" className="p-4 h-full flex flex-col gap-2">
                <span className="stat-label">Phase {i + 1}</span>
                <h3 className="text-lg font-semibold text-ink">{p.name}</h3>
                <p className="text-ink-secondary text-sm"><strong className="text-ink">Scope:</strong> {p.scope}</p>
                <p className="text-ink-secondary text-sm"><strong className="text-ink">Invest in:</strong> {p.what}</p>
                <p className="text-ink-secondary text-sm"><strong className="text-ink">Move on when:</strong> {p.gate}</p>
              </GlassPanel>
            </li>
          ))}
        </ol>
        <p className="text-ink-muted text-xs">The prototype does not estimate rollout costs: there is no sourced basis for them yet.</p>
      </section>

      <GlassPanel variant="deco" className="col-span-12 p-5 flex flex-col gap-3">
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
    </>
  );
}

function Methods({ meta }: { meta: MetaFile }) {
  const scenario = useScenario();
  const query = encodeScenario(scenario);
  const sources = meta.sourcesCatalog.filter((s) => s.id !== "fixture-placeholder");
  // The chip meanings shown app-wide (lib/data/provenance.ts), in the order the data file lists them.
  const legend = Object.keys(meta.provenanceLegend) as Provenance[];
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
                <p className="text-ink-secondary text-sm"><strong className="text-ink">How well it works:</strong> {m.evidence}</p>
                <p className="text-ink-muted text-xs"><strong>Technique:</strong> {m.technique}</p>
                <Link className="text-sm link" href={withQuery(m.page, query)}>See it on the page</Link>
              </GlassPanel>
            </li>
          ))}
        </ol>
        <p className="text-ink-secondary text-sm">
          Method notes: <a className="link" href={`${REPO}/docs/04-synthetic-world.md`}>synthetic world</a> ·{" "}
          <a className="link" href={`${REPO}/docs/05-models.md`}>models</a> · <a className="link" href={`${REPO}/docs/06-decisions.md`}>decisions</a>.
          The brief asks &ldquo;what data is essential, and why&rdquo; (KQ2) twice; it is answered once, on the Demand Lab&apos;s &ldquo;Which data matters&rdquo; tab.
        </p>
      </section>

      <GlassPanel variant="chart" className="col-span-12 xl:col-span-5 p-5 flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Where each number comes from</h2>
        <ul className="flex flex-col gap-3" data-testid="provenance-legend">
          {legend.map((p) => <li key={p} className="flex flex-col items-start gap-1"><ProvenanceChip provenance={p} /><span className="text-ink-secondary text-sm">{PROVENANCE[p].meaning}</span></li>)}
        </ul>
        <p className="text-ink-muted text-xs">{meta.operatorIsFictional ? "The retailer is fictional: no real company's data is used. " : ""}No personal data is used anywhere.</p>
      </GlassPanel>

      <GlassPanel variant="chart" className="col-span-12 xl:col-span-7 p-5 flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Sources</h2>
        <ol className="source-list" data-testid="sources">
          {sources.map((s) => (
            <li key={s.id}>
              {s.citation}.{s.url ? <> Available at: <a className="link break-all" href={s.url} rel="noreferrer" target="_blank">{s.url}</a></> : null} (Accessed: {fmtDate(s.accessed)}). {s.licence}.{s.verified ? "" : " (To be verified.)"}
            </li>
          ))}
        </ol>
      </GlassPanel>
    </>
  );
}

export function Roadmap() {
  // Methods & Data comes first (team decision, 15 Nov 2026): how the numbers were made, then the roadmap.
  const [tab, setTab] = useState<"plan" | "methods">("methods");
  const meta = useArtefact("meta.json");
  const impact = useArtefact("impact.json");
  const backtest = useArtefact("backtest.json");
  const [tabsRef, glide] = useGlide<HTMLDivElement>('[aria-selected="true"]', [tab]);
  return (
    <div className="page-grid py-6">
      <PageHeader accent="fuchsia" eyebrow="Methods · Risks · Adoption" title="Roadmap"
        description="How every number in this prototype was made, what could go wrong, and how a retailer would adopt the control tower.">
        <div ref={tabsRef} className="tablist" role="tablist" aria-label="Roadmap sections" data-glide={glide ? "" : undefined}>
          <GlideIndicator box={glide} className="tab-indicator" />
          {([["methods", "Methods & Data"], ["plan", "Roadmap"]] as const).map(([id, label]) => (
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

"use client";

/** Demand Lab (plan §6.1 page 2): hidden demand and forecasting. Serves KQ1, KQ2, R3. */
import { useMemo, useState } from "react";

import { ChartFrame, ENTITY_COLOR, otherSeriesColor, TableView } from "@/components/charts/primitives";
import { HBars, TimeChart, XYChart } from "@/components/charts/svg/charts";
import { GlideIndicator, useGlide } from "@/components/motion/Glide";
import { HiddenDemandReveal } from "@/components/signature/HiddenDemandReveal";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toggle } from "@/components/ui/controls";
import type { AblationFile, CalendarFile, CatalogFile, RealDataFile, SeriesFile } from "@/lib/contracts";
import { useArtefact, useSeries } from "@/lib/data/hooks";
import { inWindow, useDateWindow } from "@/lib/data/windows";
import { fmtShare, fmtSignedPct } from "@/lib/format";
import { useScenario } from "@/lib/state/scenarioStore";

type Row = SeriesFile["rows"][number];
const TABS = [
  { id: "synthetic", label: "Synthetic world" },
  { id: "real", label: "Real data (FreshRetailNet)" },
  { id: "ablation", label: "What data matters" },
] as const;

/** Legacy forecast: the 28-day average of RECORDED sales up to the day before (what P0 plans from). DERIVED. */
export function legacyForecast(rows: Row[]): (number | null)[] {
  return rows.map((_, i) => {
    if (i < 28) return null;
    let s = 0;
    for (let j = i - 28; j < i; j += 1) s += rows[j].recordedSales;
    return s / 28;
  });
}

export function bias(pred: (number | null)[], truth: (number | null)[]): { wpe: number; wape: number; n: number } {
  let e = 0, a = 0, t = 0, n = 0;
  pred.forEach((p, i) => {
    const y = truth[i];
    if (p === null || y === null) return;
    e += p - y; a += Math.abs(p - y); t += y; n += 1;
  });
  return { wpe: t ? e / t : 0, wape: t ? a / t : 0, n };
}

/** The readout states what the measured bias shows; it never claims more than the numbers. */
export function explainBias(wpe: number, legacy: boolean): string {
  if (legacy) return "Planning from recorded sales under-forecasts: stockouts hide the demand it never saw.";
  if (Math.abs(wpe) <= 0.08) return "Trained on recovered demand, the forecast is close to unbiased here (the P50 sits a little low because demand is right-skewed).";
  return wpe < 0
    ? "The AI forecast under-forecasts in this window: unannounced events (the March 2026 stockpiling wave) and supply shocks are not among its inputs. Spike detection and intraday top-ups handle them (Live Ops, Scenario Studio)."
    : "The AI forecast over-forecasts in this window; the backtests (Impact) show what that costs in waste.";
}

function festivalShades(calendar: CalendarFile, start: string, end: string) {
  return calendar.festivals
    .filter((f) => f.end >= start && f.start <= end && ["ramadan", "eid", "eid-al-fitr", "eid-al-adha"].some((k) => f.kind.includes(k) || f.id.includes(k)))
    .map((f) => ({ start: f.start < start ? start : f.start, end: f.end > end ? end : f.end, label: f.name }));
}

function StockoutStrip({ rows }: { rows: Row[] }) {
  const cell = 14;
  const first = new Date(`${rows[0].date}T00:00:00`).getDay();
  const offset = (first + 6) % 7; // Monday = 0
  const weeks = Math.ceil((rows.length + offset) / 7);
  const ramp = ["var(--seq-100)", "var(--seq-200)", "var(--seq-300)", "var(--seq-400)", "var(--seq-500)", "var(--seq-600)", "var(--seq-700)"];
  const colour = (h: number) => (h === 0 ? "rgba(255,255,255,0.05)" : ramp[Math.min(6, Math.floor((h / 16) * 7))]);
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Stockout heat strip (scrolls sideways)">
      <svg width={weeks * (cell + 2) + 30} height={7 * (cell + 2) + 4} role="img" aria-label="Stockout hours per day, weeks by weekday">
        {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
          <text key={i} x={0} y={i * (cell + 2) + cell - 2} fill="var(--ink-muted)" fontSize={10}>{d}</text>
        ))}
        {rows.map((r, i) => {
          const k = i + offset;
          return (
            <rect key={r.date} x={30 + Math.floor(k / 7) * (cell + 2)} y={(k % 7) * (cell + 2)} width={cell} height={cell} rx={2}
              fill={colour(r.stockoutHours)}><title>{`${r.date}: ${r.stockoutHours} of 16 trading hours out of stock`}</title></rect>
          );
        })}
      </svg>
      <p className="text-ink-muted text-xs mt-1">Darker = more trading hours (06:00–21:59) out of stock under the legacy rule.</p>
    </div>
  );
}

function SyntheticTab({ catalog, calendar }: { catalog: CatalogFile; calendar: CalendarFile }) {
  const { selection } = useScenario();
  const series = useSeries(selection.storeId, selection.skuId);
  const win = useDateWindow();
  const [legacy, setLegacy] = useState(false);
  const sku = catalog.skus.find((s) => s.id === selection.skuId);
  const store = catalog.stores.find((s) => s.id === selection.storeId);
  const title = `${store?.name ?? ""} · ${sku?.name ?? ""} · ${win.label}`;
  return (
    <DataState result={series} what="the demand series" minHeight={320}>
      {(d) => <SyntheticCharts all={d.rows} rows={inWindow(d.rows, win)} title={title} legacy={legacy} setLegacy={setLegacy}
        shades={festivalShades(calendar, win.start, win.end)} price={sku?.priceAED ?? 0} />}
    </DataState>
  );
}

function SyntheticCharts({ all, rows, title, legacy, setLegacy, shades, price }: {
  all: Row[]; rows: Row[]; title: string; legacy: boolean; setLegacy: (v: boolean) => void;
  shades: { start: string; end: string; label: string }[]; price: number;
}) {
  const legacyAll = useMemo(() => legacyForecast(all), [all]);
  if (rows.length < 2) return <p className="text-ink-muted">No days in this window.</p>;
  const offset = all.findIndex((r) => r.date === rows[0].date);
  const legacyFc = legacyAll.slice(offset, offset + rows.length);
  const truth = rows.map((r) => r.trueDemand);
  const ai = rows.map((r) => r.fcP50);
  const shown = legacy ? legacyFc : ai;
  const stats = bias(shown, truth);
  const dates = rows.map((r) => r.date);
  return (
    <div className="flex flex-col gap-4">
      <ChartFrame title="Recorded sales vs recovered and true demand, with the forecast" subtitle={title}
        provenance={["CALIBRATED_SYNTHETIC", "PRECOMPUTED"]}
        legend={[{ label: "True demand", color: ENTITY_COLOR.truth }, { label: "Recorded sales", color: ENTITY_COLOR.baseline },
          { label: "Recovered demand", color: ENTITY_COLOR.ai },
          legacy ? { label: "Legacy forecast (28-day avg of sales)", color: ENTITY_COLOR.baseline, style: "dashed" as const }
            : { label: "AI forecast P50 and P10–P90", color: ENTITY_COLOR.ai, style: "dashed" as const }]}
        actions={<Toggle label="Legacy forecast" checked={legacy} onChange={setLegacy} />}
        table={<TableView caption="Daily series" rows={rows} columns={[
          { key: "d", label: "Date", value: (r) => r.date }, { key: "t", label: "True demand", value: (r) => r.trueDemand, numeric: true },
          { key: "s", label: "Recorded sales", value: (r) => r.recordedSales, numeric: true },
          { key: "r", label: "Recovered", value: (r) => r.recoveredDemand, numeric: true },
          { key: "p10", label: "P10", value: (r) => r.fcP10, numeric: true }, { key: "p50", label: "P50", value: (r) => r.fcP50, numeric: true },
          { key: "p90", label: "P90", value: (r) => r.fcP90, numeric: true }, { key: "o", label: "Stockout h", value: (r) => r.stockoutHours, numeric: true }]} />}>
        <TimeChart dates={dates} shades={shades} ariaLabel="Daily demand and forecast"
          series={[
            { id: "true", label: "True demand", color: ENTITY_COLOR.truth, values: truth },
            { id: "sales", label: "Recorded sales", color: ENTITY_COLOR.baseline, values: rows.map((r) => r.recordedSales) },
            { id: "rec", label: "Recovered demand", color: ENTITY_COLOR.ai, values: rows.map((r) => r.recoveredDemand) },
            { id: "fc", label: legacy ? "Legacy forecast" : "AI forecast P50", color: legacy ? ENTITY_COLOR.baseline : ENTITY_COLOR.ai,
              values: shown, dashed: true },
          ]}
          band={legacy ? undefined : { label: "AI P10–P90", color: ENTITY_COLOR.ai, lo: rows.map((r) => r.fcP10), hi: rows.map((r) => r.fcP90) }} />
        <p className="text-sm text-ink-secondary" data-testid="bias-readout">
          {stats.n > 0
            ? <>Against the true demand on {stats.n} days: <strong className="text-ink">bias {fmtSignedPct(stats.wpe * 100)}</strong>,
              {" "}WAPE {fmtShare(stats.wape)}. {explainBias(stats.wpe, legacy)}</>
            : "The AI forecast covers the Jan–Oct 2026 test window: pick a 2026 window."}
        </p>
      </ChartFrame>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="When shelves were empty" subtitle="Stockout hours per day under the legacy rule" provenance="CALIBRATED_SYNTHETIC"
          table={<TableView caption="Stockout hours" rows={rows} columns={[{ key: "d", label: "Date", value: (r) => r.date },
            { key: "h", label: "Stockout hours", value: (r) => r.stockoutHours, numeric: true }]} />}>
          <StockoutStrip rows={rows} />
        </ChartFrame>
        <ChartFrame title="Reveal the hidden demand" provenance={["CALIBRATED_SYNTHETIC", "PRECOMPUTED"]}
          legend={[{ label: "Recorded sales", color: ENTITY_COLOR.baseline }, { label: "True demand", color: ENTITY_COLOR.truth },
            { label: "Recovered", color: ENTITY_COLOR.ai, style: "dashed" }]}
          table={<TableView caption="Hidden demand" rows={rows} columns={[{ key: "d", label: "Date", value: (r) => r.date },
            { key: "l", label: "Lost sales", value: (r) => r.lostSales, numeric: true }]} />}>
          <HiddenDemandReveal rows={rows} priceAED={price} height={220} />
        </ChartFrame>
      </div>
    </div>
  );
}

function RealTab({ file }: { file: RealDataFile }) {
  const curves = file.entries.map((e, i) => ({
    id: e.datasetId, label: e.label, color: otherSeriesColor(i),
    points: e.stockoutShareByHour.map((v, h) => ({ x: h, y: v * 100, label: `${h}:00` })).filter((p) => p.x >= 6 && p.x <= 21),
  }));
  const frn = file.entries.find((e) => e.datasetId === "frn-50k");
  const m = frn?.masking;
  const sources = ["Wang et al. (2025)", "Dingdong-Inc FreshRetailNet-50K and -LT"];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartFrame title="Stockouts build through the day" subtitle="Share of SKUs out of stock by hour (all-day outages excluded)"
        provenance="REAL" sources={sources} legend={curves.map((c) => ({ label: c.label, color: c.color }))}
        table={<TableView caption="Stockout share by hour" rows={Array.from({ length: 24 }, (_, h) => h)} columns={[
          { key: "h", label: "Hour", value: (h) => `${h}:00` },
          ...file.entries.map((e) => ({ key: e.datasetId, label: e.label, value: (h: number) => +(e.stockoutShareByHour[h] * 100).toFixed(1), numeric: true }))]} />}>
        <XYChart curves={curves} xLabel="Hour of day" yLabel="Out of stock (%)" ariaLabel="Stockout share by hour in FreshRetailNet"
          formatX={(v) => `${v}:00`} formatY={(v) => `${v}%`} />
      </ChartFrame>
      <ChartFrame title="Busy days are the ones that sell out" subtitle="Morning sales ratio: days that sell out after 14:00 vs fully in-stock days"
        provenance="REAL" sources={sources}
        table={<TableView caption="Censoring evidence" rows={file.entries} columns={[{ key: "l", label: "Dataset", value: (e) => e.label },
          { key: "r", label: "Ratio", value: (e) => e.censoring.ratio, numeric: true }, { key: "o", label: "Trading hours out of stock", value: (e) => fmtShare(e.oosHoursShare) }]} />}>
        <HBars ariaLabel="Morning sales ratio by dataset" format={(v) => `${v.toFixed(2)}×`}
          rows={file.entries.map((e, i) => ({ label: e.label, value: e.censoring.ratio, color: otherSeriesColor(i) }))} />
        <p className="text-sm text-ink-secondary mt-2">Stockouts hit the highest-demand days, so a history of sales hides the most demand exactly where it matters.</p>
      </ChartFrame>
      {m && m.naiveForecastWpe !== null && m.recoveredForecastWpe !== null ? (
        <ChartFrame className="lg:col-span-2" title="Training on recovered demand removes the forecast bias (real data)"
          subtitle="Forecast bias (WPE) on the evaluation week; negative = under-forecast" provenance="REAL" sources={sources}
          table={<TableView caption="Masking and bias test" rows={[
            { k: "Forecast bias, trained on raw sales (ours)", v: fmtSignedPct(m.naiveForecastWpe * 100) },
            { k: "Forecast bias, trained on recovered demand (ours)", v: fmtSignedPct(m.recoveredForecastWpe * 100) },
            { k: "Forecast bias, raw sales (paper, TFT)", v: fmtSignedPct(file.paperReference.naiveWpe * 100, 2) },
            { k: "Hidden-demand WAPE, masking test (ours)", v: fmtShare(m.recoveryWape ?? 0) },
            { k: "Best masked-recovery WAPE (paper, TimesNet)", v: fmtShare(file.paperReference.bestRecoveryWape) }]}
            columns={[{ key: "k", label: "Measure", value: (r) => r.k }, { key: "v", label: "Value", value: (r) => r.v }]} />}>
          <HBars ariaLabel="Forecast bias by training target" format={(v) => fmtSignedPct(v)}
            rows={[{ label: "Trained on raw sales", value: m.naiveForecastWpe * 100, color: ENTITY_COLOR.baseline },
              { label: "Trained on recovered", value: m.recoveredForecastWpe * 100, color: ENTITY_COLOR.ai },
              { label: "Paper: raw sales (TFT)", value: file.paperReference.naiveWpe * 100, color: otherSeriesColor(2) }]} />
          <p className="text-sm text-ink-secondary mt-2">
            Masking test: {m.method} Hidden-demand WAPE {fmtShare(m.recoveryWape ?? 0)} (bias {fmtSignedPct((m.recoveryWpe ?? 0) * 100)});
            the paper&apos;s deep models reach {fmtShare(file.paperReference.bestRecoveryWape)} under their own protocol. {file.notes[1] ?? ""}
          </p>
        </ChartFrame>
      ) : null}
    </div>
  );
}

function AblationTab({ file }: { file: AblationFile }) {
  const rows = [...file.groups].sort((a, b) => b.deltaWape - a.deltaWape);
  return (
    <ChartFrame title="Which data matters most (KQ2)" subtitle={`Increase in forecast error (WAPE, pts) when each data source is removed; full model ${fmtShare(file.full.wape)}`}
      provenance="PRECOMPUTED"
      table={<TableView caption="Ablation" rows={rows} columns={[{ key: "l", label: "Without", value: (g) => g.label },
        { key: "w", label: "WAPE", value: (g) => fmtShare(g.wape) }, { key: "dw", label: "ΔWAPE (pts)", value: (g) => +(g.deltaWape * 100).toFixed(1), numeric: true },
        { key: "db", label: "ΔBias (pts)", value: (g) => +(g.deltaWpe * 100).toFixed(1), numeric: true }]} />}>
      <HBars ariaLabel="Increase in WAPE without each data source" format={(v) => `+${v.toFixed(1)} pts`}
        rows={rows.map((g, i) => ({ label: g.label, value: g.deltaWape * 100, emphasis: i === 0 }))} />
      <p className="text-sm text-ink-secondary mt-2">{file.evaluation}</p>
    </ChartFrame>
  );
}

export function DemandLab() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("synthetic");
  const catalog = useArtefact("catalog.json");
  const calendar = useArtefact("calendar.json");
  const real = useArtefact("realdata.json");
  const ablation = useArtefact("ablation.json");
  const [tabsRef, glide] = useGlide<HTMLDivElement>('[aria-selected="true"]', [tab]);
  return (
    <div className="page-grid py-6">
      <PageHeader accent="cyan" eyebrow="Hidden demand · Forecasting · Data value" title="Demand Lab"
        description="How much demand do empty shelves hide, how well does the AI recover it, and which data matters?" />
      <div ref={tabsRef} className="col-span-12 tablist" role="tablist" aria-label="Demand Lab views" data-glide={glide ? "" : undefined}>
        <GlideIndicator box={glide} className="tab-indicator" />
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
            className="tab" onClick={() => setTab(t.id)}>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <section className="col-span-12" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "synthetic" ? (
          <DataState result={catalog} what="the catalogue">
            {(c) => <DataState result={calendar} what="the calendar">{(cal) => <SyntheticTab catalog={c} calendar={cal} />}</DataState>}
          </DataState>
        ) : tab === "real" ? (
          <DataState result={real} what="the real-data results">{(f) => <RealTab file={f} />}</DataState>
        ) : (
          <DataState result={ablation} what="the ablation">{(f) => <AblationTab file={f} />}</DataState>
        )}
      </section>
      <p className="col-span-12 text-ink-muted text-xs">Hidden demand and forecasts: calibrated synthetic world; real-data tab: FreshRetailNet (REAL).</p>
    </div>
  );
}

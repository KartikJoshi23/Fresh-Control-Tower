"use client";

/** Demand Lab (plan §6.1 page 2): hidden demand and forecasting. Serves KQ1, KQ2, R3. */
import { useMemo, useState } from "react";

import { ChartFrame, ENTITY_COLOR, TableView, useSeriesFilter } from "@/components/charts/primitives";
import { HBars, TimeChart } from "@/components/charts/svg/charts";
import { GlideIndicator, useGlide } from "@/components/motion/Glide";
import { HiddenDemandReveal } from "@/components/signature/HiddenDemandReveal";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AblationFile, CalendarFile, CatalogFile, SeriesFile } from "@/lib/contracts";
import { useArtefact, useSeries } from "@/lib/data/hooks";
import { inWindow, useDateWindow } from "@/lib/data/windows";
import { fmtDate, fmtInt, fmtShare } from "@/lib/format";
import { useScenario } from "@/lib/state/scenarioStore";

type Row = SeriesFile["rows"][number];
const TABS = [
  { id: "demand", label: "Hidden demand and forecasts" },
  { id: "data", label: "Which data matters" },
] as const;

/** The current method's forecast: the 28-day average of RECORDED sales up to the day before (what it orders from). */
export function legacyForecast(rows: Row[]): (number | null)[] {
  return rows.map((_, i) => {
    if (i < 28) return null;
    let s = 0;
    for (let j = i - 28; j < i; j += 1) s += rows[j].recordedSales;
    return s / 28;
  });
}

/** Average over/under-forecast (wpe, signed share of true demand) and typical daily error (wape) over the days both exist. */
export function bias(pred: (number | null)[], truth: (number | null)[]): { wpe: number; wape: number; n: number } {
  let e = 0, a = 0, t = 0, n = 0;
  pred.forEach((p, i) => {
    const y = truth[i];
    if (p === null || y === null) return;
    e += p - y; a += Math.abs(p - y); t += y; n += 1;
  });
  return { wpe: t ? e / t : 0, wape: t ? a / t : 0, n };
}

/** One plain sentence on a forecast's accuracy; it never claims more than the numbers show. */
export function explainBias(name: string, wpe: number, wape: number): string {
  const dir = Math.abs(wpe) < 0.005 ? "about right on average" : `${wpe < 0 ? "too low" : "too high"} by ${fmtShare(Math.abs(wpe), 0)} on average`;
  return `${name} was ${dir}, and off by ${fmtShare(wape, 0)} on a typical day.`;
}

/** Why the current method's forecast runs low (shown when it does). */
export const LEGACY_REASON = "It under-forecasts because it learns from till sales, and empty shelves hide the demand it never sees.";

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
              fill={colour(r.stockoutHours)}><title>{`${fmtDate(r.date)}: shelf empty for ${r.stockoutHours} of 16 opening hours`}</title></rect>
          );
        })}
      </svg>
      <div className="heat-key" aria-hidden="true">
        <span>0 hours</span>
        {[0, 3, 6, 9, 12, 16].map((h) => <span key={h} className="heat-key-cell" style={{ background: colour(h) }} />)}
        <span>16 hours empty</span>
      </div>
    </div>
  );
}

function DemandTab({ catalog, calendar }: { catalog: CatalogFile; calendar: CalendarFile }) {
  const { selection } = useScenario();
  const series = useSeries(selection.storeId, selection.skuId);
  const win = useDateWindow();
  const sku = catalog.skus.find((s) => s.id === selection.skuId);
  const store = catalog.stores.find((s) => s.id === selection.storeId);
  const title = `${store?.name ?? ""} · ${sku?.name ?? ""} · ${win.label}`;
  return (
    <DataState result={series} what="the demand series" minHeight={320}>
      {(d) => <DemandCharts all={d.rows} rows={inWindow(d.rows, win)} title={title}
        shades={festivalShades(calendar, win.start, win.end)} price={sku?.priceAED ?? 0} />}
    </DataState>
  );
}

function DemandCharts({ all, rows, title, shades, price }: {
  all: Row[]; rows: Row[]; title: string; shades: { start: string; end: string; label: string }[]; price: number;
}) {
  const legacyAll = useMemo(() => legacyForecast(all), [all]);
  const history = useSeriesFilter();
  const forecast = useSeriesFilter();
  const reveal = useSeriesFilter();
  if (rows.length < 2) return <p className="text-ink-muted">No days in this period.</p>;
  const offset = all.findIndex((r) => r.date === rows[0].date);
  const legacyFc = legacyAll.slice(offset, offset + rows.length);
  const truth = rows.map((r) => r.trueDemand);
  const aiFc = rows.map((r) => r.fcP50);
  const ai = bias(aiFc, truth);
  const legacy = bias(legacyFc, truth);
  const dates = rows.map((r) => r.date);
  const historySeries = [
    { id: "true", label: "True demand (what customers wanted)", color: ENTITY_COLOR.truth, values: truth },
    { id: "sales", label: "Recorded sales (what the till saw)", color: ENTITY_COLOR.baseline, values: rows.map((r) => r.recordedSales) },
    { id: "rec", label: "Demand recovered by the AI", color: ENTITY_COLOR.ai, values: rows.map((r) => r.recoveredDemand) },
  ];
  const forecastSeries = [
    { id: "true", label: "True demand", color: ENTITY_COLOR.truth, values: truth },
    { id: "ai", label: "AI forecast", color: ENTITY_COLOR.ai, values: aiFc, dashed: true },
    { id: "legacy", label: "Current method's forecast", color: ENTITY_COLOR.baseline, values: legacyFc, dashed: true },
  ];
  return (
    <div className="flex flex-col gap-4">
      <ChartFrame title="What customers wanted vs what the till recorded" subtitle={title}
        provenance={["CALIBRATED_SYNTHETIC", "PRECOMPUTED"]} filter={history}
        legend={historySeries.map((x) => ({ id: x.id, label: x.label, color: x.color }))}
        note={<>Units per day of one item in one store; shaded bands are Ramadan and Eid. When the shelf runs empty, the till records
          fewer sales than customers wanted (the gap between the green and orange lines). The violet line is the AI&apos;s estimate of
          that true demand, worked out from the till data alone.</>}
        table={<TableView caption="Units per day" rows={rows} columns={[
          { key: "d", label: "Date", value: (r) => fmtDate(r.date) }, { key: "t", label: "True demand (units)", value: (r) => r.trueDemand, numeric: true },
          { key: "s", label: "Recorded sales (units)", value: (r) => r.recordedSales, numeric: true },
          { key: "r", label: "Recovered by the AI (units)", value: (r) => r.recoveredDemand, numeric: true },
          { key: "o", label: "Hours the shelf was empty", value: (r) => r.stockoutHours, numeric: true }]} />}>
        <TimeChart dates={dates} shades={shades} ariaLabel="True demand, recorded sales and the AI's recovered demand, per day"
          yLabel="Units per day" series={historySeries.filter((x) => history.isShown(x.id))} />
      </ChartFrame>

      <ChartFrame title="How close each forecast came to true demand" subtitle={title}
        provenance={["CALIBRATED_SYNTHETIC", "PRECOMPUTED"]} filter={forecast}
        legend={[...forecastSeries.map((x) => ({ id: x.id, label: x.label, color: x.color, style: x.dashed ? "dashed" as const : "solid" as const })),
          { label: "AI's likely range (8 in 10 days fall inside)", color: ENTITY_COLOR.ai, style: "band" as const }]}
        note={<>Units per day. Dashed lines are forecasts made before each day; the solid green line is what customers actually wanted.
          The closer a dashed line follows the green one, the better the forecast. The violet shading is the range the AI expected
          demand to fall in.</>}
        table={<TableView caption="Forecasts, units per day" rows={rows.map((r, i) => ({ ...r, legacy: legacyFc[i] }))} columns={[
          { key: "d", label: "Date", value: (r) => fmtDate(r.date) }, { key: "t", label: "True demand", value: (r) => r.trueDemand, numeric: true },
          { key: "ai", label: "AI forecast", value: (r) => r.fcP50, numeric: true },
          { key: "lo", label: "AI likely range, low", value: (r) => r.fcP10, numeric: true },
          { key: "hi", label: "AI likely range, high", value: (r) => r.fcP90, numeric: true },
          { key: "lg", label: "Current method's forecast", value: (r) => (r.legacy === null ? null : Math.round(r.legacy * 10) / 10), numeric: true }]} />}>
        <TimeChart dates={dates} shades={shades} ariaLabel="True demand against the AI forecast and the current method's forecast, per day"
          yLabel="Units per day" series={forecastSeries.filter((x) => forecast.isShown(x.id))}
          band={forecast.isShown("ai") ? { label: "AI likely range", color: ENTITY_COLOR.ai, lo: rows.map((r) => r.fcP10), hi: rows.map((r) => r.fcP90) } : undefined} />
        <p className="text-sm text-ink-secondary mt-2" data-testid="bias-readout">
          {ai.n > 0
            ? <>Over these {fmtInt(ai.n)} days: {explainBias("The AI forecast", ai.wpe, ai.wape)}{" "}
              {legacy.n > 0 ? <>{explainBias("The current method's forecast", legacy.wpe, legacy.wape)}{legacy.wpe < 0 ? ` ${LEGACY_REASON}` : ""}</> : null}</>
            : "The AI forecast covers January to October 2026: pick a 2026 period in the Scenario panel."}
        </p>
      </ChartFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="When the shelf was empty" subtitle="Hours per day with no stock, under the current method" provenance="CALIBRATED_SYNTHETIC"
          note={<>Each square is one day: columns are weeks, rows are days of the week. The darker the square, the more of the
            16 opening hours (06:00 to 22:00) the shelf stood empty.</>}
          table={<TableView caption="Hours the shelf was empty" rows={rows} columns={[{ key: "d", label: "Date", value: (r) => fmtDate(r.date) },
            { key: "h", label: "Hours empty (of 16)", value: (r) => r.stockoutHours, numeric: true }]} />}>
          <StockoutStrip rows={rows} />
        </ChartFrame>
        <ChartFrame title="Reveal the hidden demand" provenance={["CALIBRATED_SYNTHETIC", "PRECOMPUTED"]} filter={reveal}
          legend={[{ id: "recorded", label: "Recorded sales", color: ENTITY_COLOR.baseline }, { id: "truth", label: "True demand", color: ENTITY_COLOR.truth },
            { id: "recovered", label: "Recovered by the AI", color: ENTITY_COLOR.ai, style: "dashed" }]}
          note={<>Drag the handle: to its right, the shaded gap is demand the till never saw, and the counters add it up.</>}
          table={<TableView caption="Missed sales per day" rows={rows} columns={[{ key: "d", label: "Date", value: (r) => fmtDate(r.date) },
            { key: "l", label: "Missed sales (units)", value: (r) => r.lostSales, numeric: true }]} />}>
          <HiddenDemandReveal rows={rows} priceAED={price} height={240}
            show={{ recorded: reveal.isShown("recorded"), truth: reveal.isShown("truth"), recovered: reveal.isShown("recovered") }} />
        </ChartFrame>
      </div>
    </div>
  );
}

/** Plain wording for each ablation row ("what was taken away"). */
const ABLATION_LABEL: Record<string, string> = {
  "history-only": "Only past sales (all other data removed)",
  "stock-status": "No stock status (learns from till sales)",
  calendar: "No calendar and festivals",
  promotions: "No promotions and prices",
  weather: "No weather",
};

function AblationTab({ file }: { file: AblationFile }) {
  const rows = [...file.groups].sort((a, b) => b.deltaWape - a.deltaWape);
  const label = (g: AblationFile["groups"][number]) => ABLATION_LABEL[g.id] ?? g.label;
  return (
    <ChartFrame title="Which data the forecast needs most" provenance="PRECOMPUTED"
      subtitle={`Extra forecast error when one type of data is taken away. With all data, the forecast is off by ${fmtShare(file.full.wape, 0)} on a typical day.`}
      note={<>Each bar shows how many percentage points the typical daily error grows without that data, for 1 to 7 days ahead over
        January to October 2026. <strong>The longer the bar, the more the forecast depends on that data.</strong> Supplier lead times
        matter for ordering, not for forecasting demand, so they are not tested here.</>}
      table={<TableView caption="Forecast error without each type of data" rows={rows} columns={[{ key: "l", label: "Data used", value: label },
        { key: "w", label: "Typical daily error", value: (g) => fmtShare(g.wape) },
        { key: "dw", label: "Extra error (percentage points)", value: (g) => +(g.deltaWape * 100).toFixed(1), numeric: true },
        { key: "db", label: "Change in average under/over-forecast (points)", value: (g) => +(g.deltaWpe * 100).toFixed(1), numeric: true }]} />}>
      <HBars ariaLabel="Extra forecast error without each type of data" format={(v) => `+${v.toFixed(1)} points`}
        rows={rows.map((g, i) => ({ label: label(g), value: g.deltaWape * 100, emphasis: i === 0 }))} />
    </ChartFrame>
  );
}

export function DemandLab() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("demand");
  const catalog = useArtefact("catalog.json");
  const calendar = useArtefact("calendar.json");
  const ablation = useArtefact("ablation.json");
  const [tabsRef, glide] = useGlide<HTMLDivElement>('[aria-selected="true"]', [tab]);
  return (
    <div className="page-grid py-6">
      <PageHeader accent="cyan" eyebrow="Hidden demand · Forecasting · Data value" title="Demand Lab"
        description="How much demand do empty shelves hide, how well does the AI work it out and forecast it, and which data does it need?" />
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
        {tab === "demand" ? (
          <DataState result={catalog} what="the catalogue">
            {(c) => <DataState result={calendar} what="the calendar">{(cal) => <DemandTab catalog={c} calendar={cal} />}</DataState>}
          </DataState>
        ) : (
          <DataState result={ablation} what="the data test">{(f) => <AblationTab file={f} />}</DataState>
        )}
      </section>
    </div>
  );
}

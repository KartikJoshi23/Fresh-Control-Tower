"use client";

/**
 * Hidden Demand Reveal (plan §6.3 #1; design-system colour rule: recorded sales slot 2, true demand slot 3,
 * recovered demand slot 1). Drag the veil (or use the slider / arrow keys): to its left the chart shows only
 * what the legacy system records; to its right it reveals the true demand, shades the gap as hidden demand
 * with a live AED counter, and shows how much of it the AI's recovered demand finds.
 */
import { scaleLinear, scaleTime } from "d3-scale";
import { area, line } from "d3-shape";
import { useId, useMemo, useState } from "react";

import { useWidth } from "@/components/charts/svg/charts";
import { CHART, ENTITY_COLOR } from "@/components/charts/primitives/theme";
import { fmtAED, fmtInt, fmtShare } from "@/lib/format";

export interface RevealRow {
  date: string;
  trueDemand: number | null;
  recordedSales: number;
  recoveredDemand: number | null;
}

const parse = (d: string) => new Date(`${d}T00:00:00`);

export function revealTotals(rows: RevealRow[], priceAED: number) {
  let hidden = 0;
  let found = 0;
  for (const r of rows) {
    if (r.trueDemand === null) continue;
    hidden += Math.max(r.trueDemand - r.recordedSales, 0);
    found += Math.max(Math.min(r.recoveredDemand ?? r.recordedSales, r.trueDemand) - r.recordedSales, 0);
  }
  return { hiddenUnits: hidden, hiddenAED: hidden * priceAED, recoveredShare: hidden > 0 ? found / hidden : 0 };
}

export function HiddenDemandReveal({ rows, priceAED, height = 280 }: { rows: RevealRow[]; priceAED: number; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [veil, setVeil] = useState(0.5);
  const id = useId().replace(/:/g, "");
  const m = { t: 12, r: 12, b: 28, l: 48 };
  const x = useMemo(() => scaleTime().domain([parse(rows[0].date), parse(rows[rows.length - 1].date)]).range([m.l, width - m.r]),
    [rows, width, m.l, m.r]);
  const yMax = Math.max(1, ...rows.map((r) => Math.max(r.trueDemand ?? 0, r.recordedSales, r.recoveredDemand ?? 0))) * 1.08;
  const y = scaleLinear().domain([0, yMax]).nice().range([height - m.b, m.t]);
  const px = (i: number) => x(parse(rows[i].date));
  const mk = (get: (r: RevealRow) => number | null) =>
    line<RevealRow>().defined((r) => get(r) !== null).x((r) => x(parse(r.date))).y((r) => y(get(r) as number))(rows) ?? "";
  const gap = area<RevealRow>().defined((r) => r.trueDemand !== null).x((r) => x(parse(r.date)))
    .y0((r) => y(r.recordedSales)).y1((r) => y(Math.max(r.trueDemand as number, r.recordedSales)))(rows) ?? "";
  const veilX = m.l + veil * (width - m.l - m.r);
  const cut = rows.findIndex((_, i) => px(i) >= veilX);
  const revealed = rows.slice(cut < 0 ? rows.length : cut);
  const totals = revealTotals(revealed, priceAED);
  const sliderId = `${id}-veil`;
  return (
    <div className="flex flex-col gap-3" data-testid="hidden-demand-reveal">
      <div className="reveal-stats" aria-live="polite">
        <div><span className="stat-label">Hidden demand revealed</span>
          <span className="stat-value tabular-nums">{fmtInt(totals.hiddenUnits)} units</span></div>
        <div><span className="stat-label">Lost revenue it represents</span>
          <span className="stat-value tabular-nums">{fmtAED(totals.hiddenAED)}</span></div>
        <div><span className="stat-label">Share the AI recovers</span>
          <span className="stat-value tabular-nums">{fmtShare(totals.recoveredShare, 0)}</span></div>
      </div>
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} className="chart-svg" role="img"
          aria-label="Recorded sales versus true and recovered demand, with a movable veil"
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            const left = e.clientX - e.currentTarget.getBoundingClientRect().left;
            setVeil(Math.min(1, Math.max(0, (left - m.l) / (width - m.l - m.r))));
          }}>
          <defs>
            <clipPath id={`${id}-right`}><rect x={veilX} y={0} width={Math.max(0, width - veilX)} height={height} /></clipPath>
          </defs>
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fill={CHART.inkMuted} fontSize={11}>{fmtInt(t)}</text>
            </g>
          ))}
          {x.ticks(Math.max(2, Math.floor(width / 120))).map((t) => (
            <text key={+t} x={x(t)} y={height - 8} textAnchor="middle" fill={CHART.inkMuted} fontSize={11}>
              {t.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </text>
          ))}
          <g clipPath={`url(#${id}-right)`}>
            <path d={gap} fill={ENTITY_COLOR.truth} opacity={0.22} />
            <path d={mk((r) => r.trueDemand)} fill="none" stroke={ENTITY_COLOR.truth} strokeWidth={2} />
            <path d={mk((r) => r.recoveredDemand)} fill="none" stroke={ENTITY_COLOR.ai} strokeWidth={2} strokeDasharray="5 4" />
          </g>
          <path d={mk((r) => r.recordedSales)} fill="none" stroke={ENTITY_COLOR.baseline} strokeWidth={2} />
          <line x1={veilX} x2={veilX} y1={m.t} y2={height - m.b} stroke="var(--ink-secondary)" strokeWidth={1.5} />
          <rect x={veilX - 7} y={(height - m.b + m.t) / 2 - 16} width={14} height={32} rx={7} fill="var(--surface)"
            stroke="var(--ink-secondary)" style={{ cursor: "ew-resize" }} />
          <text x={Math.max(m.l + 4, veilX - 8)} y={m.t + 12} textAnchor="end" fill={CHART.inkMuted} fontSize={11}>What the legacy system sees</text>
          <text x={veilX + 8} y={m.t + 12} fill={CHART.inkMuted} fontSize={11}>What customers wanted</text>
        </svg>
      </div>
      <label htmlFor={sliderId} className="control-label">
        <span>Veil position: drag the handle, or use this slider</span>
      </label>
      <input id={sliderId} type="range" min={0} max={1} step={0.01} value={veil} onChange={(e) => setVeil(Number(e.target.value))}
        className="w-full" style={{ "--fill": `${veil * 100}%` } as React.CSSProperties} />
    </div>
  );
}

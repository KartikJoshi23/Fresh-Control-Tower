"use client";

/**
 * Lightweight SVG charts on d3-scale + d3-shape (no Recharts: keeps routes inside the JS budget, KI-15).
 * Rules (plan §6.5): 2 px lines, no dual axes, recessive grids, ink-coloured text, crosshair tooltip on
 * lines (mouse and keyboard: focus the chart, then ←/→), per-mark values on bars.
 * CR-003 polish: solid lines draw in on mount (pathLength + CSS), the AI series carries a soft glow, the
 * crosshair shows a ringed marker per series, and bars grow from the baseline. All CSS; reduced motion stops it.
 */
import { scaleBand, scaleLinear, scaleTime } from "d3-scale";
import { area, line } from "d3-shape";
import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";

import { ChartTooltip } from "@/components/charts/primitives/ChartTooltip";
import { CHART, ENTITY_COLOR } from "@/components/charts/primitives/theme";

/** Class names for a series line: draw-in for solid lines, glow for the AI entity. */
const lineClass = (color: string, dashed?: boolean) =>
  ["chart-line", dashed ? "" : "chart-line-draw", color === ENTITY_COLOR.ai ? "chart-line-glow" : ""].filter(Boolean).join(" ");

export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
/** Dates are "YYYY-MM-DD" (daily) or "YYYY-MM-DDTHH:mm" (hourly, Gulf local time as written). */
const parse = (d: string) => new Date(d.includes("T") ? d : `${d}T00:00:00`);
const tickLabel = (t: Date, hourly: boolean) => hourly
  ? `${t.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${String(t.getHours()).padStart(2, "0")}:00`
  : t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

export interface TimeSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

interface TimeChartProps {
  dates: string[];
  series: TimeSeries[];
  band?: { label: string; color: string; lo: (number | null)[]; hi: (number | null)[] };
  shades?: { start: string; end: string; label: string }[];
  height?: number;
  formatY?: (v: number) => string;
  ariaLabel: string;
}

export function TimeChart({ dates, series, band, shades = [], height = 300, formatY = fmt, ariaLabel }: TimeChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 12, r: 12, b: 28, l: 52 };
  const x = useMemo(() => scaleTime().domain([parse(dates[0]), parse(dates[dates.length - 1])]).range([m.l, width - m.r]),
    [dates, width, m.l, m.r]);
  const yMax = useMemo(() => {
    const all = [...series.flatMap((s) => s.values), ...(band?.hi ?? [])].filter((v): v is number => v !== null);
    return Math.max(1, ...all) * 1.08;
  }, [series, band]);
  const y = scaleLinear().domain([0, yMax]).nice().range([height - m.b, m.t]);
  const lineOf = (vals: (number | null)[]) =>
    line<number | null>().defined((v) => v !== null).x((_, i) => x(parse(dates[i]))).y((v) => y(v as number))(vals) ?? "";
  const bandPath = band
    ? area<number>().defined((i) => band.lo[i] !== null && band.hi[i] !== null)
        .x((i) => x(parse(dates[i]))).y0((i) => y(band.lo[i] as number)).y1((i) => y(band.hi[i] as number))(dates.map((_, i) => i)) ?? ""
    : "";
  const ticks = x.ticks(Math.max(2, Math.floor(width / 110)));
  const index = (px: number) => {
    const t = x.invert(px).getTime();
    let best = 0;
    dates.forEach((d, i) => { if (Math.abs(parse(d).getTime() - t) < Math.abs(parse(dates[best]).getTime() - t)) best = i; });
    return best;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setHover((h) => Math.min(dates.length - 1, (h ?? -1) + 1));
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? dates.length) - 1));
    if (e.key === "Escape") setHover(null);
  };
  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey}
        onMouseMove={(e) => setHover(index(e.clientX - e.currentTarget.getBoundingClientRect().left))}
        onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)} className="chart-svg">
        {shades.map((s) => (
          <g key={s.label + s.start}>
            <rect x={x(parse(s.start))} y={m.t} width={Math.max(2, x(parse(s.end)) - x(parse(s.start)))} height={height - m.t - m.b}
              fill="rgba(196,167,255,0.06)" />
            {x(parse(s.start)) < width - 90 ? <text x={x(parse(s.start)) + 4} y={m.t + 12} fill={CHART.inkMuted} fontSize={11}>{s.label}</text> : null}
          </g>
        ))}
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fill={CHART.inkMuted} fontSize={11} className="tabular-nums">{formatY(t)}</text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={+t} x={x(t)} y={height - 8} textAnchor="middle" fill={CHART.inkMuted} fontSize={11}>
            {tickLabel(t, dates[0].includes("T"))}
          </text>
        ))}
        {band ? <path d={bandPath} fill={band.color} opacity={0.18} /> : null}
        {series.map((s) => (
          <path key={s.id} d={lineOf(s.values)} fill="none" stroke={s.color} strokeWidth={CHART.lineWidth}
            strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round"
            pathLength={s.dashed ? undefined : 1} className={lineClass(s.color, s.dashed)} />
        ))}
        {hover !== null ? (
          <g className="chart-crosshair">
            <line x1={x(parse(dates[hover]))} x2={x(parse(dates[hover]))} y1={m.t} y2={height - m.b} stroke="var(--accent)"
              strokeOpacity={0.55} strokeDasharray="3 3" />
            {series.map((s) => (s.values[hover] === null ? null : (
              <circle key={s.id} cx={x(parse(dates[hover]))} cy={y(s.values[hover] as number)} r={4.5} fill={s.color}
                stroke="var(--surface)" strokeWidth={2} />
            )))}
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div className="chart-tip-anchor" style={{ left: Math.min(width - 190, Math.max(0, x(parse(dates[hover])) + 12)) }}>
          <ChartTooltip title={dates[hover].includes("T") ? `${parse(dates[hover]).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${dates[hover].slice(11)}`
            : parse(dates[hover]).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            rows={[
              ...series.map((s) => ({ label: s.label, value: s.values[hover] === null ? "—" : formatY(s.values[hover] as number), color: s.color })),
              ...(band && band.lo[hover] !== null ? [{ label: band.label, value: `${formatY(band.lo[hover] as number)}–${formatY(band.hi[hover] as number)}`, color: band.color }] : []),
            ]} />
        </div>
      ) : null}
    </div>
  );
}

export interface BarRow {
  label: string;
  value: number;
  color?: string;
  emphasis?: boolean;
  note?: string;
}

/** Horizontal bars with direct value labels; signed values draw from a zero line. Bars animate on re-order. */
export function HBars({ rows, format = fmt, rowHeight = 30, ariaLabel, color = "var(--series-1)" }: {
  rows: BarRow[]; format?: (v: number) => string; rowHeight?: number; ariaLabel: string; color?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const labelW = Math.min(200, Math.round(width * 0.36));
  const valueW = 72;
  const lo = Math.min(0, ...rows.map((r) => r.value));
  const hi = Math.max(0, ...rows.map((r) => r.value));
  const x = scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).range([labelW, width - valueW]);
  const y = scaleBand().domain(rows.map((r) => r.label)).range([0, rows.length * rowHeight]).padding(0.25);
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={rows.length * rowHeight} role="img" aria-label={ariaLabel} className="chart-svg">
        {lo < 0 ? <line x1={x(0)} x2={x(0)} y1={0} y2={rows.length * rowHeight} stroke={CHART.axis} /> : null}
        {rows.map((r) => {
          const x0 = x(Math.min(0, r.value));
          const w = Math.max(2, Math.abs(x(r.value) - x(0)));
          return (
            <g key={r.label} style={{ transform: `translateY(${y(r.label)}px)`, transition: "transform 300ms cubic-bezier(.2,.9,.3,1)" }}>
              <text x={labelW - 8} y={y.bandwidth() / 2 + 4} textAnchor="end" fill={r.emphasis ? "var(--ink-primary)" : CHART.ink}
                fontSize={12} fontWeight={r.emphasis ? 600 : 400}>{r.label}</text>
              <rect x={x0} y={0} width={w} height={y.bandwidth()} rx={CHART.barRadius} fill={r.color ?? color}
                opacity={r.emphasis === false ? 0.45 : 1} className="chart-bar"
                style={{ transformOrigin: `${x(0)}px 0px`, transition: "width 300ms, x 300ms" }} />
              <text x={r.value < 0 ? x0 - 6 : x0 + w + 6} y={y.bandwidth() / 2 + 4} textAnchor={r.value < 0 ? "end" : "start"}
                fill={CHART.ink} fontSize={12} className="tabular-nums">{format(r.value)}{r.note ? ` ${r.note}` : ""}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface XYCurve {
  id: string;
  label: string;
  color: string;
  points: { x: number; y: number; label?: string }[];
}

/** Curves on two linear axes (for example availability vs waste), with an optional "you are here" marker. */
export function XYChart({ curves, xLabel, yLabel, height = 280, marker, ariaLabel, formatX = fmt, formatY = fmt, pick }: {
  curves: XYCurve[]; xLabel: string; yLabel: string; height?: number; ariaLabel: string;
  marker?: { x: number; y: number; label: string; color: string }; formatX?: (v: number) => string; formatY?: (v: number) => string;
  /** Drag (or click) along one curve: reports the index of the nearest point. Pair it with an accessible control. */
  pick?: { curveId: string; onIndex: (index: number) => void };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const m = { t: 12, r: 16, b: 40, l: 52 };
  const xs = curves.flatMap((c) => c.points.map((p) => p.x));
  const ys = curves.flatMap((c) => c.points.map((p) => p.y));
  const x = scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).nice().range([m.l, width - m.r]);
  const y = scaleLinear().domain([Math.min(0, ...ys), Math.max(...ys) * 1.1]).nice().range([height - m.b, m.t]);
  const path = (pts: XYCurve["points"]) => line<XYCurve["points"][number]>().x((p) => x(p.x)).y((p) => y(p.y))([...pts].sort((a, b) => a.x - b.x)) ?? "";
  const [dragging, setDragging] = useState(false);
  const nearest = (e: PointerEvent<SVGSVGElement>) => {
    const curve = curves.find((c) => c.id === pick?.curveId);
    if (!curve || !pick) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    let best = 0;
    curve.points.forEach((p, i) => {
      const d = (x(p.x) - px) ** 2 + (y(p.y) - py) ** 2;
      const b = (x(curve.points[best].x) - px) ** 2 + (y(curve.points[best].y) - py) ** 2;
      if (d < b) best = i;
    });
    pick.onIndex(best);
  };
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="chart-svg"
        style={pick ? { cursor: dragging ? "grabbing" : "grab", touchAction: "none" } : undefined}
        onPointerDown={pick ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); nearest(e); } : undefined}
        onPointerMove={pick ? (e) => { if (dragging) nearest(e); } : undefined}
        onPointerUp={pick ? () => setDragging(false) : undefined}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fill={CHART.inkMuted} fontSize={11}>{formatY(t)}</text>
          </g>
        ))}
        {x.ticks(5).map((t) => (
          <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle" fill={CHART.inkMuted} fontSize={11}>{formatX(t)}</text>
        ))}
        <text x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle" fill={CHART.ink} fontSize={12}>{xLabel}</text>
        <text transform={`translate(12 ${(height - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle" fill={CHART.ink} fontSize={12}>{yLabel}</text>
        {curves.map((c) => (
          <g key={c.id}>
            <path d={path(c.points)} fill="none" stroke={c.color} strokeWidth={CHART.lineWidth} strokeLinejoin="round"
              strokeLinecap="round" pathLength={1} className={lineClass(c.color)} />
            {c.points.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r={3.5} fill={c.color} stroke="var(--surface)" strokeWidth={1.5}
              className="chart-point"><title>{`${c.label}: ${p.label ?? ""} ${formatX(p.x)}, ${formatY(p.y)}`}</title></circle>)}
          </g>
        ))}
        {marker ? (
          <g>
            <circle cx={x(marker.x)} cy={y(marker.y)} r={7} fill="none" stroke={marker.color} strokeWidth={2} className="chart-marker-pulse" />
            <circle cx={x(marker.x)} cy={y(marker.y)} r={7} fill="none" stroke={marker.color} strokeWidth={2} />
            <text x={x(marker.x) + (x(marker.x) > width * 0.7 ? -10 : 10)} y={y(marker.y) - 10}
              textAnchor={x(marker.x) > width * 0.7 ? "end" : "start"} fill="var(--ink-primary)" fontSize={12}>{marker.label}</text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

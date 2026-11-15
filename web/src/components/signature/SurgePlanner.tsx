"use client";

/**
 * Surge Planner (plan §6.3 #2, requirement R4): a timeline with one lane per supplier. Each lane shows the
 * lead time (neutral ink), the shelf-life window of a pre-built delivery (sequential tint) and the order-by
 * marker (status colour + icon: ✓ open, ✕ closed). "Too early = spoils; too late = short" made visible.
 */
import { scaleLinear } from "d3-scale";

import { dateAxisTitle, textWidth, useWidth } from "@/components/charts/svg/charts";
import { CHART } from "@/components/charts/primitives/theme";
import type { SupplierOption, planSurge } from "@/lib/engine/surge";
import { fmtDayMonth } from "@/lib/format";

/** Day indexes are positions in `dates` (the planning horizon); labels show the dates, day-first. */
export function SurgePlanner({ plan, options, names, dates, today, spikeStart, spikeDays, sellable, buffer = 1 }: {
  plan: ReturnType<typeof planSurge>; options: SupplierOption[]; names: Record<string, string>; dates: string[]; today: number;
  spikeStart: number; spikeDays: number; sellable: number; buffer?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const horizon = dates.length;
  const day = (i: number) => fmtDayMonth(dates[Math.min(Math.max(0, i), horizon - 1)]);
  // Wide: supplier names to the left of each lane. Narrow (phones): the name sits above its lane.
  const narrow = width < 640;
  const lane = narrow ? 58 : 44;
  const longest = Math.max(...options.map((o) => textWidth(names[o.id] ?? o.id, 12)));
  const m = { t: 38, r: 16, b: 44, l: narrow ? 16 : Math.round(Math.min(Math.max(150, longest + 18), width * 0.42)) };
  const barY = narrow ? 20 : 2;
  const height = m.t + options.length * lane + m.b;
  const x = scaleLinear().domain([0, horizon]).range([m.l, width - m.r]);
  const arrival = spikeStart - buffer;
  return (
    <div ref={ref} className="w-full" data-testid="surge-planner">
      <svg width={width} height={height} role="img" className="chart-svg"
        aria-label={`Surge planner: a spike from ${day(spikeStart)} for ${spikeDays} days, and the last day to order from each supplier`}>
        <rect x={x(spikeStart)} y={m.t - 8} width={x(spikeStart + spikeDays) - x(spikeStart)} height={options.length * lane + 8}
          fill="rgba(255,255,255,0.07)" />
        <text x={x(spikeStart) + 4} y={m.t - 24} fill={CHART.ink} fontSize={11}>Spike</text>
        <line x1={x(today)} x2={x(today)} y1={m.t - 6} y2={height - m.b} stroke="var(--ink-secondary)" strokeDasharray="3 3" />
        {/* "Spike known" sits on its own line under "Spike"; it flips to the right of its marker if it would run off the left edge. */}
        <text x={x(today) - 4 - textWidth(`Spike known (${day(today)})`) < 2 ? x(today) + 4 : x(today) - 4} y={m.t - 10}
          textAnchor={x(today) - 4 - textWidth(`Spike known (${day(today)})`) < 2 ? "start" : "end"} fill={CHART.inkMuted} fontSize={11}>Spike known ({day(today)})</text>
        {options.map((s, i) => {
          const y0 = m.t + i * lane + 6;
          const latest = plan.latestSafeOrderDay[s.id];
          const open = today <= latest;
          return (
            <g key={s.id}>
              {narrow ? (
                <text x={m.l} y={y0 + 10} fill={CHART.ink} fontSize={12}>{names[s.id] ?? s.id}
                  <tspan fill={CHART.inkMuted} fontSize={11}>{` · ${s.leadDays} ${s.leadDays === 1 ? "day" : "days"} to deliver`}</tspan></text>
              ) : (
                <>
                  <text x={m.l - 10} y={y0 + 10} textAnchor="end" fill={CHART.ink} fontSize={12}>{names[s.id] ?? s.id}</text>
                  <text x={m.l - 10} y={y0 + 24} textAnchor="end" fill={CHART.inkMuted} fontSize={11}>{s.leadDays} {s.leadDays === 1 ? "day" : "days"} to deliver</text>
                </>
              )}
              <rect x={x(arrival)} y={y0 + barY} width={Math.max(2, x(arrival + sellable) - x(arrival))} height={20} rx={4}
                fill="var(--seq-300)" opacity={0.35}><title>{`Stock delivered on ${day(arrival)} can be sold until ${day(arrival + sellable - 1)}`}</title></rect>
              <line x1={x(Math.max(0, latest))} x2={x(arrival)} y1={y0 + barY + 10} y2={y0 + barY + 10} stroke="var(--ink-secondary)" strokeWidth={2} />
              <g transform={`translate(${x(Math.max(0, latest))} ${y0 + barY + 10})`}>
                <circle r={9} fill="var(--surface)" stroke={`var(--status-${open ? "good" : "critical"})`} strokeWidth={2} />
                <text textAnchor="middle" y={4} fontSize={11} fill={`var(--status-${open ? "good" : "critical"})`}>{open ? "✓" : "✕"}</text>
                <title>{open ? `Order by ${day(latest)}: still possible` : `The last day to order was ${day(latest)}: too late`}</title>
              </g>
            </g>
          );
        })}
        {x.ticks(Math.max(2, Math.floor((width - m.l) / 70))).filter((t) => Number.isInteger(t) && t < horizon).map((t) => (
          <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle" fill={CHART.inkMuted} fontSize={11} className="tabular-nums">{day(t)}</text>
        ))}
        <text x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle" fill={CHART.ink} fontSize={12}>{dateAxisTitle(dates)}</text>
      </svg>
    </div>
  );
}

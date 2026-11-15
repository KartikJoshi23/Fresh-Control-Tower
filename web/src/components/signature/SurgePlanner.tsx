"use client";

/**
 * Surge Planner (plan §6.3 #2, requirement R4): a timeline with one lane per supplier. Each lane shows the
 * lead time (neutral ink), the shelf-life window of a pre-built delivery (sequential tint) and the order-by
 * marker (status colour + icon: ✓ open, ✕ closed). "Too early = spoils; too late = short" made visible.
 */
import { scaleLinear } from "d3-scale";

import { useWidth } from "@/components/charts/svg/charts";
import { CHART } from "@/components/charts/primitives/theme";
import type { SupplierOption, planSurge } from "@/lib/engine/surge";

export function SurgePlanner({ plan, options, today, spikeStart, spikeDays, horizon, sellable, buffer = 1 }: {
  plan: ReturnType<typeof planSurge>; options: SupplierOption[]; today: number; spikeStart: number; spikeDays: number;
  horizon: number; sellable: number; buffer?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const lane = 40;
  const m = { t: 24, r: 16, b: 28, l: 150 };
  const height = m.t + options.length * lane + m.b;
  const x = scaleLinear().domain([0, horizon]).range([m.l, width - m.r]);
  const arrival = spikeStart - buffer;
  return (
    <div ref={ref} className="w-full" data-testid="surge-planner">
      <svg width={width} height={height} role="img" className="chart-svg"
        aria-label={`Surge planner: spike on day ${spikeStart} for ${spikeDays} days; order-by day per supplier`}>
        <rect x={x(spikeStart)} y={m.t - 8} width={x(spikeStart + spikeDays) - x(spikeStart)} height={options.length * lane + 8}
          fill="rgba(255,255,255,0.07)" />
        <text x={x(spikeStart) + 4} y={m.t - 12} fill={CHART.ink} fontSize={11}>Spike</text>
        <line x1={x(today)} x2={x(today)} y1={m.t - 8} y2={height - m.b} stroke="var(--ink-secondary)" strokeDasharray="3 3" />
        <text x={x(today) - 4} y={m.t - 12} textAnchor="end" fill={CHART.inkMuted} fontSize={11}>Today (day {today})</text>
        {options.map((s, i) => {
          const y0 = m.t + i * lane + 6;
          const latest = plan.latestSafeOrderDay[s.id];
          const open = today <= latest;
          return (
            <g key={s.id}>
              <text x={m.l - 10} y={y0 + 14} textAnchor="end" fill={CHART.ink} fontSize={12}>{s.id.replace("sup-", "")} · {s.leadDays} d</text>
              <rect x={x(arrival)} y={y0 + 2} width={Math.max(2, x(arrival + sellable) - x(arrival))} height={20} rx={4}
                fill="var(--seq-300)" opacity={0.35}><title>{`Sellable window of a delivery on day ${arrival}`}</title></rect>
              <line x1={x(Math.max(0, latest))} x2={x(arrival)} y1={y0 + 12} y2={y0 + 12} stroke="var(--ink-secondary)" strokeWidth={2} />
              <g transform={`translate(${x(Math.max(0, latest))} ${y0 + 12})`}>
                <circle r={9} fill="var(--surface)" stroke={`var(--status-${open ? "good" : "critical"})`} strokeWidth={2} />
                <text textAnchor="middle" y={4} fontSize={11} fill={`var(--status-${open ? "good" : "critical"})`}>{open ? "✓" : "✕"}</text>
                <title>{open ? `Order by day ${latest}: window open` : `Order-by day ${latest} has passed: window closed`}</title>
              </g>
            </g>
          );
        })}
        {x.ticks(7).map((t) => (
          <text key={t} x={x(t)} y={height - 6} textAnchor="middle" fill={CHART.inkMuted} fontSize={11}>day {t}</text>
        ))}
      </svg>
    </div>
  );
}

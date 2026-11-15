"use client";

/**
 * Route Globe (plan §6.3 #4): where each supplier's produce travels and which legs the Hormuz disruption hits.
 * The WebGL globe is lazy-loaded; the flat SVG map is the fallback (no WebGL, reduced motion, or the user's choice)
 * and the table view lists every route for screen readers.
 */
import { scaleLinear } from "d3-scale";
import { TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { textWidth, useWidth } from "@/components/charts/svg/charts";
import { CHART } from "@/components/charts/primitives/theme";

import { DASH, originLabels, type RouteView } from "./routeGeometry";

const Globe3D = dynamic(() => import("./RouteGlobe3D"), {
  ssr: false,
  loading: () => <div className="data-state" style={{ minHeight: 420 }} role="status">Loading the globe…</div>,
});

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type MapLabel = { text: string; x: number; y: number; anchor: "start" | "middle" | "end"; ink: boolean };

/**
 * Greedy label placement for the flat map: labels are kept inside the chart and placed in priority order (the
 * UAE, then chokepoints, then origins); one that would overlap a placed label is left out. Every route and
 * place is still named in the table view and in the route tooltips.
 */
export function placeLabels(labels: MapLabel[], width: number): MapLabel[] {
  const placed: { box: [number, number, number, number]; label: MapLabel }[] = [];
  for (const l of labels) {
    const w = textWidth(l.text);
    let left = l.anchor === "end" ? l.x - w : l.anchor === "middle" ? l.x - w / 2 : l.x;
    left = Math.min(Math.max(2, left), width - w - 2);
    const box: [number, number, number, number] = [left, l.y - 11, left + w, l.y + 2];
    if (placed.some((p) => box[0] < p.box[2] && box[2] > p.box[0] && box[1] < p.box[3] && box[3] > p.box[1])) continue;
    placed.push({ box, label: { ...l, x: left, anchor: "start" } });
  }
  return placed.map((p) => p.label);
}

export function FlatRouteMap({ routes, chokepoints }: { routes: RouteView[]; chokepoints: { name: string; lat: number; lon: number; disrupted: boolean }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = Math.min(440, Math.max(260, Math.round(width * 0.55)));
  const x = scaleLinear().domain([0, 80]).range([16, width - 16]);
  const y = scaleLinear().domain([-5, 56]).range([height - 16, 16]);
  return (
    <div ref={ref} className="w-full" data-testid="route-map-flat">
      <svg width={width} height={height} role="img" className="chart-svg" aria-label="Schematic map of supplier routes into the UAE">
        {[0, 20, 40, 60, 80].map((lon) => <line key={`lon${lon}`} x1={x(lon)} x2={x(lon)} y1={y(-5)} y2={y(56)} stroke={CHART.grid} />)}
        {[0, 15, 30, 45].map((lat) => <line key={`lat${lat}`} x1={x(0)} x2={x(80)} y1={y(lat)} y2={y(lat)} stroke={CHART.grid} />)}
        {routes.map((r) => (
          <polyline key={r.id} points={r.points.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ")} fill="none"
            stroke={r.disrupted ? "var(--status-critical)" : "var(--seq-300)"} strokeWidth={r.recommended ? 3.5 : 1.8}
            strokeDasharray={DASH[r.mode].svg} strokeLinecap="round">
            <title>{`${r.supplierName}: ${DASH[r.mode].label}${r.disrupted ? " (disrupted)" : ""}`}</title>
          </polyline>
        ))}
        {chokepoints.map((c) => (
          <circle key={c.name} cx={x(c.lon)} cy={y(c.lat)} r={4} fill={c.disrupted ? "var(--status-critical)" : "var(--ink-secondary)"} />
        ))}
        <circle cx={x(55.1)} cy={y(25)} r={5} fill="var(--accent)" />
        {placeLabels([
          { text: "UAE stores", x: x(55.1) - 8, y: y(25) + 18, anchor: "end" as const, ink: true },
          ...chokepoints.map((c) => ({ text: `${c.disrupted ? "⚠ " : ""}${c.name}`, x: x(c.lon) - 7, y: y(c.lat) + 4, anchor: "end" as const, ink: true })),
          ...originLabels(routes).map((o) => ({ text: o.text, x: x(o.lon), y: y(o.lat) - 8, anchor: "middle" as const, ink: false })),
        ], width).map((l) => (
          <text key={l.text} x={l.x} y={l.y} fontSize={11} textAnchor={l.anchor} fill={l.ink ? CHART.ink : CHART.inkMuted}
            stroke="var(--surface)" strokeWidth={4} paintOrder="stroke">{l.text}</text>
        ))}
      </svg>
    </div>
  );
}

export function RouteGlobe({ routes, chokepoints }: { routes: RouteView[]; chokepoints: { name: string; lat: number; lon: number; disrupted: boolean }[] }) {
  const [view, setView] = useState<"globe" | "flat" | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Decided once on mount: WebGL support and motion preference are only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(webglAvailable() && !reduce ? "globe" : "flat");
  }, []);
  const disrupted = routes.filter((r) => r.disrupted);
  return (
    <div className="flex flex-col gap-3" data-testid="route-globe">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="radiogroup" aria-label="Map view">
          {(["globe", "flat"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className="preset" onClick={() => setView(v)}>
              {v === "globe" ? "3D globe" : "Flat map"}</button>
          ))}
        </div>
        <ul className="legend-list text-sm">
          {(["truck", "sea", "air"] as const).map((m) => (
            <li key={m} className="flex items-center gap-2">
              <svg width={28} height={8} aria-hidden="true"><line x1={0} x2={28} y1={4} y2={4} stroke="var(--seq-300)" strokeWidth={2} strokeDasharray={DASH[m].svg} /></svg>
              <span className="text-ink-secondary">{m === "truck" ? "Truck (local and GCC)" : DASH[m].label}</span>
            </li>
          ))}
          <li className="flex items-center gap-2" style={{ color: "var(--status-critical)" }}>
            <TriangleAlert aria-hidden="true" size={14} /><span className="text-ink-secondary">Disrupted</span>
          </li>
        </ul>
      </div>
      <div className="globe-stage">
        {view === "globe" ? <Globe3D routes={routes} chokepoints={chokepoints} /> : view === "flat" ? <FlatRouteMap routes={routes} chokepoints={chokepoints} /> : null}
      </div>
      <p className="text-ink-muted text-sm" aria-live="polite">
        {disrupted.length
          ? `${disrupted.length} of ${routes.length} routes are disrupted: ${disrupted.map((r) => r.supplierName).join("; ")}.`
          : `All ${routes.length} routes running normally.`}
      </p>
    </div>
  );
}

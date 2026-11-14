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

import { useWidth } from "@/components/charts/svg/charts";
import { CHART } from "@/components/charts/primitives/theme";

import { DASH, type RouteView } from "./routeGeometry";

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
          <g key={c.name} transform={`translate(${x(c.lon)} ${y(c.lat)})`}>
            <circle r={4} fill={c.disrupted ? "var(--status-critical)" : "var(--ink-secondary)"} />
            <text x={7} y={4} fontSize={11} fill={CHART.ink}>{c.disrupted ? "⚠ " : ""}{c.name}</text>
          </g>
        ))}
        {[...new Map(routes.map((r) => [r.points[0].name, r.points[0]])).values()].filter((o) => !o.name.startsWith("UAE")).map((o) => (
          <text key={o.name} x={x(o.lon)} y={y(o.lat) - 8} fontSize={11} textAnchor="middle" fill={CHART.inkMuted}>
            {o.name.split(",")[0].replace(/ \(.*\)/, "")}</text>
        ))}
        <g transform={`translate(${x(55.1)} ${y(25)})`}>
          <circle r={5} fill="var(--accent)" />
          <text x={-8} y={18} fontSize={11} textAnchor="end" fill={CHART.ink}>UAE stores</text>
        </g>
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
          : `All ${routes.length} routes running normally.`} Routes are schematic (straight legs between the named places).
      </p>
    </div>
  );
}

/**
 * Shared route geometry for the Route Globe (WebGL) and its flat SVG fallback. Routes are SCHEMATIC: straight
 * legs between the places in routes.json (origin → chokepoints → hub), not real shipping lanes.
 */
import type { McdmFile, RoutesFile } from "@/lib/contracts";

export type Mode = RoutesFile["routes"][number]["mode"];

/** Design system §5: one hue; archetype by dash pattern (solid = truck, dashed = sea, dotted = air). */
export const DASH: Record<Mode, { label: string; svg: string | undefined; dash: number; gap: number }> = {
  local_truck: { label: "Local truck", svg: undefined, dash: 0, gap: 0 },
  truck: { label: "GCC truck", svg: undefined, dash: 0, gap: 0 },
  sea: { label: "Sea", svg: "8 5", dash: 0.06, gap: 0.04 },
  air: { label: "Air", svg: "2 4", dash: 0.015, gap: 0.03 },
};

export interface RouteView {
  id: string;
  supplierId: string;
  supplierName: string;
  mode: Mode;
  points: { lat: number; lon: number; name: string }[];
  chokepoints: string[];
  disrupted: boolean;
  recommended: boolean;
}

/** Suppliers with any adjustment in the active scenario count as disrupted. */
export function routeViews(routes: RoutesFile, mcdm: McdmFile, scenarioId: string | null, recommendedId: string | null): RouteView[] {
  const places = new Map(routes.places.map((p) => [p.id, p]));
  const hit = new Set(mcdm.scenarios.find((s) => s.id === scenarioId)?.adjustments.map((a) => a.supplierId) ?? []);
  return routes.routes.map((r) => ({
    id: r.id, supplierId: r.supplierId, supplierName: mcdm.suppliers.find((s) => s.id === r.supplierId)?.name ?? r.supplierId,
    mode: r.mode, chokepoints: r.chokepointIds, disrupted: hit.has(r.supplierId), recommended: r.supplierId === recommendedId,
    points: r.placeIds.map((id) => { const p = places.get(id)!; return { lat: p.lat, lon: p.lon, name: p.name }; }),
  }));
}

/** Unit-sphere position of a latitude/longitude (y up). */
export function toVec(lat: number, lon: number, r = 1): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

/** Points along a great-circle leg, lifted above the surface in the middle (height grows with distance). */
export function arc(a: { lat: number; lon: number }, b: { lat: number; lon: number }, steps = 48): [number, number, number][] {
  const va = toVec(a.lat, a.lon);
  const vb = toVec(b.lat, b.lon);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  const lift = 0.01 + 0.25 * (omega / Math.PI);
  const out: [number, number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const s = omega < 1e-6 ? [1 - t, t] : [Math.sin((1 - t) * omega) / Math.sin(omega), Math.sin(t * omega) / Math.sin(omega)];
    const r = 1.005 + lift * Math.sin(Math.PI * t);
    out.push([0, 1, 2].map((k) => (s[0] * va[k] + s[1] * vb[k]) * r) as [number, number, number]);
  }
  return out;
}

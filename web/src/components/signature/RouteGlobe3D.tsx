"use client";

/**
 * Route Globe, WebGL version (the ONLY WebGL scene, design system §5). Lazy-loaded with next/dynamic (ssr: false)
 * so three.js never lands in another route's bundle. A wireframe globe (graticule only: no map texture to fetch),
 * schematic route arcs in one hue, dash pattern by mode, disruption in the critical status colour with an icon label.
 */
import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { BackSide, Vector3 } from "three";

import { useReducedMotion } from "@/components/motion/reducedMotion";

import { arc, DASH, originLabels, type RouteView, toVec } from "./routeGeometry";

// three.js needs literal colours; these mirror tokens.css (CR-003 rev. 2).
const ARC = "#5fd5ee"; // --seq-300: the single arc hue (cyan)
const CRITICAL = "#f5525a"; // --status-critical
const GRID = "#2a2a31"; // neutral graphite graticule
const OCEAN = "#0a0a0d";
const HALO = "#22d3ee"; // atmosphere glow (decorative)

function Graticule() {
  const lines = useMemo(() => {
    const out: [number, number, number][][] = [];
    for (let lat = -60; lat <= 60; lat += 30) out.push(Array.from({ length: 73 }, (_, i) => toVec(lat, i * 5 - 180, 0.999)));
    for (let lon = -180; lon < 180; lon += 30) out.push(Array.from({ length: 37 }, (_, i) => toVec(i * 5 - 90, lon, 0.999)));
    return out;
  }, []);
  return <>{lines.map((pts, i) => <Line key={i} points={pts} color={GRID} lineWidth={0.6} />)}</>;
}

function Route({ route }: { route: RouteView }) {
  const pts = useMemo(() => route.points.slice(1).flatMap((p, i) => arc(route.points[i], p)), [route]);
  const d = DASH[route.mode];
  const color = route.disrupted ? CRITICAL : ARC;
  return (
    <Line points={pts} color={color} lineWidth={route.recommended ? 3.5 : 1.8} dashed={!!d.dash} dashSize={d.dash || 1} gapSize={d.gap || 0} />
  );
}

interface Label { text: string; lat: number; lon: number; kind: "hub" | "chokepoint" | "origin"; disrupted?: boolean }

/** Projects the labels onto an HTML overlay every frame and hides those on the far side of the globe. */
function LabelProjector({ labels, refs }: { labels: Label[]; refs: RefObject<(HTMLSpanElement | null)[]> }) {
  const points = useMemo(() => labels.map((l) => new Vector3(...toVec(l.lat, l.lon, 1.02))), [labels]);
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const eye = camera.position.clone().normalize();
    points.forEach((pt, i) => {
      const el = refs.current?.[i];
      if (!el) return;
      const facing = pt.clone().normalize().dot(eye) > 0.2;
      v.copy(pt).project(camera);
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
      el.style.visibility = facing ? "visible" : "hidden";
    });
  });
  return null;
}

export default function RouteGlobe3D({ routes, chokepoints }: { routes: RouteView[]; chokepoints: { name: string; lat: number; lon: number; disrupted: boolean }[] }) {
  // Face the Gulf from a little north-west so Europe and East Africa are in view.
  const cam = toVec(28, 40, 2.4);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const reduceMotion = useReducedMotion();
  // Render frames only while the globe is on screen: the auto-rotation would otherwise keep the GPU (or, on
  // devices without one, the CPU) busy for the whole visit. Lighthouse measured 15 s of blocking time on /sourcing.
  const wrap = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const labels = useMemo<Label[]>(() => [{ text: "UAE stores", lat: 25.1, lon: 55.2, kind: "hub" },
    ...chokepoints.map((c) => ({ text: c.name, lat: c.lat, lon: c.lon, kind: "chokepoint" as const, disrupted: c.disrupted })),
    ...originLabels(routes).map((o) => ({ ...o, kind: "origin" as const }))], [routes, chokepoints]);
  return (
    <div className="globe-wrap" ref={wrap}>
      <Canvas camera={{ position: cam, fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} aria-hidden="true"
        frameloop={onScreen ? "always" : "never"}>
        <mesh>
          <sphereGeometry args={[0.995, 48, 48]} />
          <meshBasicMaterial color={OCEAN} />
        </mesh>
        {/* A faint violet atmosphere: the back faces of a slightly larger sphere. */}
        <mesh>
          <sphereGeometry args={[1.03, 48, 48]} />
          <meshBasicMaterial color={HALO} transparent opacity={0.06} side={BackSide} depthWrite={false} />
        </mesh>
        <Graticule />
        {routes.map((r) => <Route key={r.id} route={r} />)}
        <LabelProjector labels={labels} refs={refs} />
        <OrbitControls enablePan={false} minDistance={1.6} maxDistance={4} rotateSpeed={0.5}
          autoRotate={!reduceMotion} autoRotateSpeed={0.35} />
      </Canvas>
      <div className="globe-overlay" aria-hidden="true">
        {labels.map((l, i) => (
          <span key={`${l.kind}-${l.text}`} ref={(el) => { refs.current[i] = el; }} className={`globe-label globe-${l.kind}`} data-disrupted={!!l.disrupted}>
            {l.kind === "hub" ? "● " : l.disrupted ? "⚠ " : ""}{l.text}
          </span>
        ))}
      </div>
    </div>
  );
}

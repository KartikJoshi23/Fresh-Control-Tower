"use client";

/**
 * The global Scenario Console (implementation-plan.md §6.2, requirement R5): a glass drawer from the top,
 * on every page. Its controls map 1:1 to the scenario store (§2.5); presets set several fields at once.
 * Escape or the close button closes it and returns focus to the Scenario button.
 * CR-003: it springs open (CSS keyframes, .scenario-console) and fades away with Motion's mini animate
 * (Web Animations API), staying mounted until the exit animation has finished.
 */
import { RotateCcw, X } from "lucide-react";
import { animate } from "motion/mini";
import { useCallback, useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "@/components/motion/reducedMotion";

import { NumberField, Select, Slider, Toggle } from "@/components/ui/controls";
import { useArtefact } from "@/lib/data/hooks";
import { matchingPreset, PRESETS, WINDOW_LABELS, WINDOWS } from "@/lib/state/scenario";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";
import { POLICY_NAME } from "@/lib/labels";

const POLICIES = [
  { value: "P0", label: POLICY_NAME.P0 },
  { value: "P1", label: POLICY_NAME.P1 },
  { value: "P2", label: POLICY_NAME.P2 },
  { value: "P3", label: POLICY_NAME.P3 },
] as const;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="console-group">
      <legend className="console-legend">{title}</legend>
      <div className="console-controls">{children}</div>
    </fieldset>
  );
}

function SeriesPicker() {
  const catalog = useArtefact("catalog.json");
  const scenario = useScenario();
  const set = useScenarioStore((s) => s.set);
  if (catalog.status !== "ok") {
    return <p className="text-ink-muted text-sm">{catalog.status === "loading" ? "Loading stores and SKUs…" : "Store and SKU list unavailable."}</p>;
  }
  const stores = new Map(catalog.data.stores.map((s) => [s.id, s.name]));
  const skus = new Map(catalog.data.skus.map((s) => [s.id, s.name]));
  const options = catalog.data.heroSeries.map((h) => ({
    value: `${h.storeId}__${h.skuId}`,
    label: `${stores.get(h.storeId)?.replace(" (fictional)", "") ?? h.storeId} · ${skus.get(h.skuId) ?? h.skuId}`,
  }));
  return (
    <Select label="Store and item" value={`${scenario.selection.storeId}__${scenario.selection.skuId}`} options={options}
      onChange={(v) => {
        const [storeId, skuId] = v.split("__");
        set("selection.storeId", storeId);
        set("selection.skuId", skuId);
      }} />
  );
}

export function ScenarioConsole() {
  const open = useScenarioStore((s) => s.consoleOpen);
  // Stay mounted after closing until the exit animation ends ("adjust state while rendering" pattern).
  const [mounted, setMounted] = useState(open);
  const onExited = useCallback(() => setMounted(false), []);
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return <ConsolePanel closing={!open} onExited={onExited} />;
}

function ConsolePanel({ closing, onExited }: { closing: boolean; onExited: () => void }) {
  const setOpen = useScenarioStore((s) => s.setConsoleOpen);
  const scenario = useScenario();
  const set = useScenarioStore((s) => s.set);
  const applyPreset = useScenarioStore((s) => s.applyPreset);
  const reset = useScenarioStore((s) => s.reset);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!closing) return;
    const el = panel.current;
    if (!el || prefersReducedMotion()) {
      // Defer to a frame so no state changes synchronously inside the effect.
      const frame = requestAnimationFrame(onExited);
      return () => cancelAnimationFrame(frame);
    }
    const exit = animate(el, { opacity: [1, 0], transform: ["translateY(0) scale(1)", "translateY(-12px) scale(0.985)"] },
      { duration: 0.18, ease: [0.4, 0, 1, 1] });
    let done = false;
    exit.finished.then(() => { if (!done) onExited(); });
    // Reopened mid-exit: cancel() reverts to the resting state (stop() would freeze it half-faded).
    return () => { done = true; exit.cancel(); };
  }, [closing, onExited]);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        document.querySelector<HTMLButtonElement>("[data-testid=scenario-button]")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const preset = matchingPreset(scenario);
  const { demand, spike, calendar, weather, supply, policy, sourcing } = scenario;
  const pct = (v: number) => `${v}%`;

  return (
    <div id="scenario-console" ref={panel} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="scenario-title"
      className="scenario-console" data-testid="scenario-console" data-closing={closing ? "" : undefined}
      inert={closing}>
      <div className="console-head">
        <div>
          <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" />What-if controls</p>
          <h2 id="scenario-title" className="console-title">Scenario Console</h2>
          <p className="text-ink-muted text-sm">Every page reads this scenario. It is saved in the link, so you can share it.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="ghost-button" onClick={reset}><RotateCcw aria-hidden="true" size={14} /> Reset</button>
          <button type="button" className="ghost-button" aria-label="Close the Scenario Console" onClick={() => setOpen(false)}>
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <div className="preset-row" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="preset" aria-pressed={preset?.id === p.id} title={p.description}
            onClick={() => applyPreset(p.id)}>{p.label}</button>
        ))}
      </div>

      <div className="console-grid">
        <Group title="Selection">
          <SeriesPicker />
          <Select label="Period" value={scenario.selection.window}
            options={WINDOWS.map((w) => ({ value: w, label: WINDOW_LABELS[w] }))}
            onChange={(v) => set("selection.window", v)} />
        </Group>
        <Group title="Demand">
          <Slider label="Demand level (× normal)" value={demand.demandMultiplier} min={0.5} max={3} step={0.1}
            format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set("demand.demandMultiplier", v)} />
          <NumberField label="Fixed demand, units per day (blank = use the forecast)" value={demand.ordersPerDay} min={0} max={5000}
            placeholder="forecast" onChange={(v) => set("demand.ordersPerDay", v)} />
        </Group>
        <Group title="Spike">
          <Toggle label="Add a sudden spike" checked={spike.enabled} onChange={(v) => set("spike.enabled", v)} />
          <Slider label="Size (× normal demand)" value={spike.magnitude} min={1.2} max={5} step={0.1} disabled={!spike.enabled}
            format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set("spike.magnitude", v)} />
          <Slider label="How long" value={spike.durationDays} min={1} max={14} step={1} disabled={!spike.enabled}
            format={(v) => `${v} ${v === 1 ? "day" : "days"}`} onChange={(v) => set("spike.durationDays", v)} />
          <Slider label="Days of warning (0 = none)" value={spike.warningDays} min={0} max={21} step={1}
            disabled={!spike.enabled} format={(v) => `${v} ${v === 1 ? "day" : "days"}`} onChange={(v) => set("spike.warningDays", v)} />
        </Group>
        <Group title="Calendar">
          <Slider label="Ramadan effect on demand" value={calendar.ramadanIntensity} min={0} max={150} step={5} format={pct}
            onChange={(v) => set("calendar.ramadanIntensity", v)} />
          <Slider label="Eid effect on demand" value={calendar.eidIntensity} min={0} max={150} step={5} format={pct}
            onChange={(v) => set("calendar.eidIntensity", v)} />
          <Toggle label="National Day" checked={calendar.nationalDay} onChange={(v) => set("calendar.nationalDay", v)} />
          <Toggle label="Summer season" checked={calendar.summerSeason} onChange={(v) => set("calendar.summerSeason", v)} />
        </Group>
        <Group title="Weather">
          <Toggle label="Heatwave" checked={weather.heatwave} onChange={(v) => set("weather.heatwave", v)} />
          <Slider label="Degrees above normal" value={weather.heatwaveDeltaC} min={1} max={8} step={0.5}
            disabled={!weather.heatwave} format={(v) => `+${v} °C`} onChange={(v) => set("weather.heatwaveDeltaC", v)} />
        </Group>
        <Group title="Supply">
          <Select label="Supply disruption" value={supply.disruptionPreset}
            options={[{ value: "none", label: "None" }, { value: "hormuz2026", label: "Hormuz 2026" }] as const}
            onChange={(v) => set("supply.disruptionPreset", v)} />
          <Slider label="Sea delivery time (× normal)" value={supply.seaLeadTimeMultiplier} min={1} max={3} step={0.1}
            format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set("supply.seaLeadTimeMultiplier", v)} />
          <Slider label="On-time deliveries drop by" value={supply.reliabilityDrop} min={0} max={50} step={5}
            format={(v) => `${v} points`} onChange={(v) => set("supply.reliabilityDrop", v)} />
          <Slider label="Freight cost increase" value={supply.freightIncrease} min={0} max={100} step={5}
            format={(v) => `+${v}%`} onChange={(v) => set("supply.freightIncrease", v)} />
        </Group>
        <Group title="Ordering">
          <Select label="Ordering method" value={policy.policy} options={POLICIES} onChange={(v) => set("policy.policy", v)} />
          <Toggle label="Stock-level setting: automatic" description="Each item uses the setting tuned on past data"
            checked={policy.serviceTarget === null} onChange={(auto) => set("policy.serviceTarget", auto ? null : 0.85)} />
          {policy.serviceTarget !== null ? (
            <Slider label="Stock-level setting" value={policy.serviceTarget} min={0.5} max={0.99} step={0.01}
              format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("policy.serviceTarget", v)} />
          ) : null}
          <Toggle label="Learn from recovered demand (not only till sales)" checked={policy.useDemandRecovery}
            onChange={(v) => set("policy.useDemandRecovery", v)} />
          <Toggle label="Send expiring food to food rescue" checked={policy.foodRescue} onChange={(v) => set("policy.foodRescue", v)} />
        </Group>
        <Group title="Sourcing">
          <Select label="How to weigh supplier criteria" value={sourcing.weightMode}
            options={[{ value: "ahp", label: "Board preference" }, { value: "entropy", label: "Data-driven" },
              { value: "custom", label: "Your own weights" }] as const}
            onChange={(v) => set("sourcing.weightMode", v)} />
        </Group>
      </div>
    </div>
  );
}

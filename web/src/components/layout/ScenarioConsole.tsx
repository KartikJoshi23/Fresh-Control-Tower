"use client";

/**
 * The global Scenario Console (implementation-plan.md §6.2, requirement R5): a glass drawer from the top,
 * on every page. Its controls map 1:1 to the scenario store (§2.5); presets set several fields at once.
 * Escape or the close button closes it and returns focus to the Scenario button.
 */
import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { NumberField, Select, Slider, Toggle } from "@/components/ui/controls";
import { useArtefact } from "@/lib/data/hooks";
import { matchingPreset, PRESETS, WINDOW_LABELS, WINDOWS } from "@/lib/state/scenario";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

const POLICIES = [
  { value: "P0", label: "P0 Baseline (legacy rule)" },
  { value: "P1", label: "P1 AI-Daily" },
  { value: "P2", label: "P2 AI-Intraday" },
  { value: "P3", label: "P3 AI-Intraday + Smart Sourcing" },
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
    <Select label="Store and SKU" value={`${scenario.selection.storeId}__${scenario.selection.skuId}`} options={options}
      onChange={(v) => {
        const [storeId, skuId] = v.split("__");
        set("selection.storeId", storeId);
        set("selection.skuId", skuId);
      }} />
  );
}

export function ScenarioConsole() {
  const open = useScenarioStore((s) => s.consoleOpen);
  const setOpen = useScenarioStore((s) => s.setConsoleOpen);
  const scenario = useScenario();
  const set = useScenarioStore((s) => s.set);
  const applyPreset = useScenarioStore((s) => s.applyPreset);
  const reset = useScenarioStore((s) => s.reset);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        document.querySelector<HTMLButtonElement>("[data-testid=scenario-button]")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  const preset = matchingPreset(scenario);
  const { demand, spike, calendar, weather, supply, policy, sourcing } = scenario;
  const pct = (v: number) => `${v}%`;

  return (
    <div id="scenario-console" ref={panel} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="scenario-title"
      className="scenario-console" data-testid="scenario-console">
      <div className="console-head">
        <div>
          <h2 id="scenario-title" className="text-ink text-lg font-semibold">Scenario Console</h2>
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
          <Select label="Date window" value={scenario.selection.window}
            options={WINDOWS.map((w) => ({ value: w, label: WINDOW_LABELS[w] }))}
            onChange={(v) => set("selection.window", v)} />
        </Group>
        <Group title="Demand">
          <Slider label="Demand multiplier" value={demand.demandMultiplier} min={0.5} max={3} step={0.1}
            format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set("demand.demandMultiplier", v)} />
          <NumberField label="Orders per day (blank = forecast median)" value={demand.ordersPerDay} min={0} max={5000}
            placeholder="forecast" onChange={(v) => set("demand.ordersPerDay", v)} />
        </Group>
        <Group title="Spike">
          <Toggle label="Inject a spike" checked={spike.enabled} onChange={(v) => set("spike.enabled", v)} />
          <Slider label="Size" value={spike.magnitude} min={1.2} max={5} step={0.1} disabled={!spike.enabled}
            format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set("spike.magnitude", v)} />
          <Slider label="Duration" value={spike.durationDays} min={1} max={14} step={1} disabled={!spike.enabled}
            format={(v) => `${v} d`} onChange={(v) => set("spike.durationDays", v)} />
          <Slider label="Warning (0 = unannounced)" value={spike.warningDays} min={0} max={21} step={1}
            disabled={!spike.enabled} format={(v) => `${v} d`} onChange={(v) => set("spike.warningDays", v)} />
        </Group>
        <Group title="Calendar">
          <Slider label="Ramadan intensity" value={calendar.ramadanIntensity} min={0} max={150} step={5} format={pct}
            onChange={(v) => set("calendar.ramadanIntensity", v)} />
          <Slider label="Eid intensity" value={calendar.eidIntensity} min={0} max={150} step={5} format={pct}
            onChange={(v) => set("calendar.eidIntensity", v)} />
          <Toggle label="National Day" checked={calendar.nationalDay} onChange={(v) => set("calendar.nationalDay", v)} />
          <Toggle label="Summer season" checked={calendar.summerSeason} onChange={(v) => set("calendar.summerSeason", v)} />
        </Group>
        <Group title="Weather">
          <Toggle label="Heatwave" checked={weather.heatwave} onChange={(v) => set("weather.heatwave", v)} />
          <Slider label="Heatwave anomaly" value={weather.heatwaveDeltaC} min={1} max={8} step={0.5}
            disabled={!weather.heatwave} format={(v) => `+${v} °C`} onChange={(v) => set("weather.heatwaveDeltaC", v)} />
        </Group>
        <Group title="Supply">
          <Select label="Disruption" value={supply.disruptionPreset}
            options={[{ value: "none", label: "None" }, { value: "hormuz2026", label: "Hormuz 2026" }] as const}
            onChange={(v) => set("supply.disruptionPreset", v)} />
          <Slider label="Sea lead time" value={supply.seaLeadTimeMultiplier} min={1} max={3} step={0.1}
            format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set("supply.seaLeadTimeMultiplier", v)} />
          <Slider label="Reliability drop" value={supply.reliabilityDrop} min={0} max={50} step={5}
            format={(v) => `−${v} pts`} onChange={(v) => set("supply.reliabilityDrop", v)} />
          <Slider label="Freight increase" value={supply.freightIncrease} min={0} max={100} step={5}
            format={(v) => `+${v}%`} onChange={(v) => set("supply.freightIncrease", v)} />
        </Group>
        <Group title="Policy">
          <Select label="Policy" value={policy.policy} options={POLICIES} onChange={(v) => set("policy.policy", v)} />
          <Toggle label="Service target: auto" description="Each SKU's optimised service quantile τ"
            checked={policy.serviceTarget === null} onChange={(auto) => set("policy.serviceTarget", auto ? null : 0.85)} />
          {policy.serviceTarget !== null ? (
            <Slider label="Service quantile τ" value={policy.serviceTarget} min={0.5} max={0.99} step={0.01}
              format={(v) => v.toFixed(2)} onChange={(v) => set("policy.serviceTarget", v)} />
          ) : null}
          <Toggle label="Use demand recovery" checked={policy.useDemandRecovery}
            onChange={(v) => set("policy.useDemandRecovery", v)} />
          <Toggle label="Food rescue" checked={policy.foodRescue} onChange={(v) => set("policy.foodRescue", v)} />
        </Group>
        <Group title="Sourcing">
          <Select label="Weights" value={sourcing.weightMode}
            options={[{ value: "ahp", label: "AHP (board preference)" }, { value: "entropy", label: "Entropy (data-driven)" },
              { value: "custom", label: "Custom" }] as const}
            onChange={(v) => set("sourcing.weightMode", v)} />
        </Group>
      </div>
    </div>
  );
}

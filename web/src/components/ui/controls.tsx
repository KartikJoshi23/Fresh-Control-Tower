"use client";

/**
 * Form controls for the Scenario Console. Native inputs for keyboard and screen-reader support;
 * the accent colour styles chrome only (focus, toggles), never data.
 */
import { type CSSProperties, useId } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step, onChange, format = String, disabled }: SliderProps) {
  const id = useId();
  return (
    <div className="control">
      <label htmlFor={id} className="control-label">
        <span>{label}</span>
        <output htmlFor={id} className="tabular-nums text-ink">{format(value)}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${((value - min) / (max - min || 1)) * 100}%` } as CSSProperties} />
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

export function Toggle({ label, checked, onChange, description }: ToggleProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="toggle" onClick={() => onChange(!checked)}>
      <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
      <span className="flex flex-col items-start text-left">
        <span className="text-ink text-sm">{label}</span>
        {description ? <span className="text-ink-muted text-xs">{description}</span> : null}
      </span>
    </button>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Select<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="control">
      <label htmlFor={id} className="control-label"><span>{label}</span></label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="select">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
  onChange: (value: number | null) => void;
}

export function NumberField({ label, value, min, max, step = 1, placeholder, onChange }: NumberFieldProps) {
  const id = useId();
  return (
    <div className="control">
      <label htmlFor={id} className="control-label"><span>{label}</span></label>
      <input id={id} type="number" className="number-field tabular-nums" min={min} max={max} step={step}
        value={value ?? ""} placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }} />
    </div>
  );
}

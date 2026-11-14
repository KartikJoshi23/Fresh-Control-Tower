"use client";

/**
 * Loading, empty and error states for every data load (definition of done, Part 5).
 * A failed fetch or contract check renders an error panel here, never a console error.
 */
import { CircleAlert, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import type { HookResult } from "@/lib/data/hooks";

interface DataStateProps<T> {
  result: HookResult<T>;
  /** What is loading, for example "the demand series". */
  what: string;
  children: (data: T) => ReactNode;
  /** Height of the placeholder while loading, to avoid layout shift (CLS budget, plan §6.6). */
  minHeight?: number;
}

export function DataState<T>({ result, what, children, minHeight = 160 }: DataStateProps<T>) {
  if (result.status === "ok") return <>{children(result.data)}</>;
  if (result.status === "loading") {
    return (
      <div className="data-state" style={{ minHeight }} role="status" aria-live="polite">
        <LoaderCircle aria-hidden="true" size={18} className="spin" />
        <span>Loading {what}…</span>
      </div>
    );
  }
  if (result.status === "empty") {
    return (
      <div className="data-state" style={{ minHeight }} role="status">
        <Inbox aria-hidden="true" size={18} />
        <span>No data for {what} yet: {result.reason}</span>
      </div>
    );
  }
  return (
    <div className="data-state data-state-error" style={{ minHeight }} role="alert" data-testid="data-error">
      <CircleAlert aria-hidden="true" size={18} style={{ color: "var(--status-critical)" }} />
      <div>
        <p className="text-ink">Could not show {what}. {result.message}</p>
        {result.detail ? <p className="text-ink-muted text-xs">{result.detail}</p> : null}
      </div>
    </div>
  );
}

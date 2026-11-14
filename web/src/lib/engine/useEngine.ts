"use client";

/**
 * Runs the engine in a Web Worker, re-computing whenever the request key changes; falls back to the main
 * thread if a worker cannot start. Tracks recompute times so the page can show the p95 (budget < 150 ms).
 */
import { useEffect, useRef, useState } from "react";

import { compute, type ComputeRequest, type ComputeResult } from "./compute";

let worker: Worker | null | undefined;
function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

export function p95(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

export function useEngine(request: Omit<ComputeRequest, "id"> | null, key: string) {
  const [state, setState] = useState<{ result: ComputeResult | null; p95: number; samples: number }>({ result: null, p95: 0, samples: 0 });
  const times = useRef<number[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    if (!request) return;
    const id = (seq.current += 1);
    const w = getWorker();
    const done = (r: ComputeResult) => {
      if (r.id !== seq.current) return;
      times.current = [...times.current.slice(-49), r.ms];
      setState({ result: r, p95: p95(times.current), samples: times.current.length });
    };
    if (!w) {
      done(compute({ ...request, id }));
      return;
    }
    const onMessage = (e: MessageEvent<ComputeResult>) => done(e.data);
    const onError = (e: Event) => {
      e.preventDefault();
      worker = null;
      done(compute({ ...request, id }));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ ...request, id });
    return () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    // `key` captures every input of `request`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/// <reference lib="webworker" />
/** The scenario engine's Web Worker (plan §6.6): keeps the 50-run Monte Carlo off the main thread. */
import { compute, type ComputeRequest } from "./compute";

self.onmessage = (event: MessageEvent<ComputeRequest>) => {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(compute(event.data));
};

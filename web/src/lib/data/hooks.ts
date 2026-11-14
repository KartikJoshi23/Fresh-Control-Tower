"use client";

/**
 * React hooks over ./load.ts. Each returns { status: "loading" } first, then the LoadResult.
 * Pages render `<DataState result={…}>` (components/ui/DataState.tsx) for the non-ok states.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

import type { ContractPath } from "@/lib/contracts";

import { fixturePaths, loadArtefact, loadSeries, type LoadResult, subscribeFixtures } from "./load";

export type HookResult<T> = LoadResult<T> | { status: "loading" };

function usePromise<T>(factory: () => Promise<LoadResult<T>>, key: string): HookResult<T> {
  const [state, setState] = useState<{ key: string; result: HookResult<T> }>({ key, result: { status: "loading" } });
  useEffect(() => {
    let live = true;
    factory().then((result) => {
      if (live) setState({ key, result });
    });
    return () => {
      live = false;
    };
    // `factory` is recreated each render; `key` identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.result : { status: "loading" };
}

export function useArtefact<P extends ContractPath>(path: P) {
  return usePromise(() => loadArtefact(path), path);
}

export function useSeries(storeId: string, skuId: string) {
  return usePromise(() => loadSeries(storeId, skuId), `${storeId}__${skuId}`);
}

let cachedKey = "";
let cachedPaths: string[] = [];
function snapshot(): string[] {
  const paths = fixturePaths();
  const key = paths.join("|");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedPaths = paths;
  }
  return cachedPaths;
}
const EMPTY: string[] = [];

/** Paths of every loaded artefact that is a fixture (empty when all data is real). */
export function useFixturePaths(): string[] {
  return useSyncExternalStore(subscribeFixtures, snapshot, () => EMPTY);
}

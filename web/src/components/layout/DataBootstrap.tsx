"use client";

/** Loads the shared artefacts once per session (meta.json, catalog.json) so the fixture banner and the
 * series picker are ready on every page. Renders nothing; pages read the same cached results. */
import { useArtefact } from "@/lib/data/hooks";

export function DataBootstrap() {
  useArtefact("meta.json");
  useArtefact("catalog.json");
  return null;
}

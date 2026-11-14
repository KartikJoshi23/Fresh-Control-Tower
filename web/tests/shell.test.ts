/**
 * Part 5 logic: the scenario URL codec, presets and chips (lib/state/scenario.ts), navigation rules
 * (components/layout/nav.ts), the chart colour rule, and the data loader's states and fixture registry.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { isActive, NAV_ITEMS, withQuery } from "@/components/layout/nav";
import { otherSeriesColor } from "@/components/charts/primitives/theme";
import { MetaFile } from "@/lib/contracts";
import { fixturePaths, loadWith, resetDataCache } from "@/lib/data/load";
import {
  activeChips,
  decodeScenario,
  DEFAULT_SCENARIO,
  encodeScenario,
  FIELDS,
  matchingPreset,
  PRESETS,
  setPath,
} from "@/lib/state/scenario";

describe("scenario URL codec", () => {
  it("encodes the defaults as an empty query", () => {
    expect(encodeScenario(DEFAULT_SCENARIO)).toBe("");
    expect(decodeScenario("")).toEqual(DEFAULT_SCENARIO);
  });

  it("round-trips every preset and a hand-made scenario", () => {
    for (const preset of PRESETS) {
      const state = preset.apply(DEFAULT_SCENARIO);
      expect(decodeScenario(encodeScenario(state))).toEqual(state);
    }
    let s = setPath(DEFAULT_SCENARIO, "selection.storeId", "auh-reem");
    s = setPath(s, "policy.serviceTarget", 0.9);
    s = setPath(s, "supply.supplierOutage", "sup-sea-import");
    s = setPath(s, "spike.date", "2026-03-01");
    s = setPath(s, "selection.window", "hormuz");
    expect(encodeScenario(s)).toBe("store=auh-reem&win=hormuz&spd=2026-03-01&out=sup-sea-import&tau=0.9");
    expect(decodeScenario(encodeScenario(s))).toEqual(s);
  });

  it("clamps out-of-range numbers and ignores junk without throwing", () => {
    const s = decodeScenario("dm=99&spl=2.6&tau=auto&pol=P9&sp=yes&spd=tomorrow&store=../etc&ram=-5");
    expect(s.demand.demandMultiplier).toBe(3);
    expect(s.spike.durationDays).toBe(3);
    expect(s.policy.serviceTarget).toBeNull();
    expect(s.policy.policy).toBe("P3");
    expect(s.spike.enabled).toBe(false);
    expect(s.spike.date).toBe(DEFAULT_SCENARIO.spike.date);
    expect(s.selection.storeId).toBe("dxb-marina");
    expect(decodeScenario("win=last-year").selection.window).toBe("test-2026");
    expect(s.calendar.ramadanIntensity).toBe(0);
  });

  it("uses unique, stable query keys", () => {
    const keys = FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(FIELDS.find((f) => f.path === "demand.demandMultiplier")?.key).toBe("dm");
  });
});

describe("presets and chips", () => {
  it("offers the five presets of the design system and recognises each one", () => {
    expect(PRESETS.map((p) => p.label)).toEqual(["Normal", "Ramadan 2026", "200→500 Spike", "Hormuz 2026", "Heatwave"]);
    for (const p of PRESETS) expect(matchingPreset(p.apply(DEFAULT_SCENARIO))?.id).toBe(p.id);
    expect(matchingPreset(DEFAULT_SCENARIO)).toBeNull();                       // the whole 2026 window is "custom"
    expect(PRESETS.map((p) => p.apply(DEFAULT_SCENARIO).selection.window)).toEqual(
      ["normal", "ramadan-2026", "stockpiling", "hormuz", "summer"]);
  });

  it("does not stack presets and keeps the selection", () => {
    const picked = setPath(DEFAULT_SCENARIO, "selection.skuId", "bananas-1kg");
    const hormuz = PRESETS[3].apply(picked);
    const heat = PRESETS[4].apply(hormuz);
    expect(heat.supply.disruptionPreset).toBe("none");
    expect(heat.weather.heatwave).toBe(true);
    expect(heat.selection.skuId).toBe("bananas-1kg");
  });

  it("describes the active scenario as chips", () => {
    expect(activeChips(DEFAULT_SCENARIO)).toEqual([]);
    expect(activeChips(PRESETS[2].apply(DEFAULT_SCENARIO))).toEqual(["Window: Stockpiling spike", "200/day", "Spike 2.5×"]);
    expect(activeChips(PRESETS[3].apply(DEFAULT_SCENARIO))).toEqual(["Window: Hormuz 2026", "Hormuz disruption"]);
    const announced = setPath(setPath(DEFAULT_SCENARIO, "spike.enabled", true), "spike.warningDays", 7);
    expect(activeChips(announced)).toEqual(["Spike 2.5×, 7 d warning"]);
  });
});

describe("navigation", () => {
  it("lists the seven pages in order and marks the active one", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Overview", "Demand Lab", "Scenario Studio", "Live Ops", "Sourcing", "Impact", "Roadmap"]);
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/demand/", "/")).toBe(false);
    expect(isActive("/demand", "/demand/")).toBe(true);
    expect(isActive("/demand/real-data/", "/demand/")).toBe(true);
    expect(isActive("/demandx/", "/demand/")).toBe(false);
  });

  it("carries the scenario query on links", () => {
    expect(withQuery("/live/", "")).toBe("/live/");
    expect(withQuery("/live/", "dm=1.5")).toBe("/live/?dm=1.5");
  });
});

describe("chart colours", () => {
  it("never cycles hues: a sixth extra series must be folded into Other", () => {
    expect(otherSeriesColor(0)).toBe("var(--series-4)");
    expect(() => otherSeriesColor(5)).toThrow();
  });
});

describe("data loader", () => {
  const meta = readFileSync(new URL("../public/data/meta.json", import.meta.url), "utf-8");
  const respond = (body: string, status = 200) => (async () => new Response(body, { status })) as typeof fetch;

  beforeEach(() => resetDataCache());

  it("returns ok for a valid artefact and registers it as real data", async () => {
    const result = await loadWith("meta.json", MetaFile, respond(meta));
    expect(result.status).toBe("ok");
    expect(fixturePaths()).toEqual([]);
  });

  it("registers fixtures so the placeholder banner appears", async () => {
    const fixture = JSON.stringify({ ...JSON.parse(meta), isFixture: true });
    await loadWith("meta.json", MetaFile, respond(fixture));
    expect(fixturePaths()).toEqual(["meta.json"]);
    await loadWith("meta.json", MetaFile, respond(meta));
    expect(fixturePaths()).toEqual([]);
  });

  it("turns every failure into a state, never an exception", async () => {
    expect((await loadWith("meta.json", MetaFile, respond("", 404))).status).toBe("empty");
    expect(await loadWith("meta.json", MetaFile, respond("", 500))).toMatchObject({ status: "error", detail: "HTTP 500" });
    expect(await loadWith("meta.json", MetaFile, respond("{not json"))).toMatchObject({ status: "error" });
    const broken = await loadWith("meta.json", MetaFile, respond(JSON.stringify({ ...JSON.parse(meta), currency: "USD" })));
    expect(broken).toMatchObject({ status: "error", message: "meta.json does not match its data contract." });
    const offline = await loadWith("meta.json", MetaFile, (async () => { throw new TypeError("offline"); }) as typeof fetch);
    expect(offline).toMatchObject({ status: "error", detail: "Network error" });
  });
});

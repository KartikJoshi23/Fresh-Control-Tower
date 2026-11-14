/**
 * Surge planner (plan §4.2, requirement R4): a port of pipeline/freshpipe/optimise.py `plan_surge`.
 * "How early do we stock up?" for a KNOWN spike: latest safe order day per supplier, whether one pre-built
 * delivery covers the spike inside its sellable shelf life, and the options with lost units, waste, cost
 * and CO2e. Tested against the same worked example as the Python test.
 */
export interface SupplierOption {
  id: string;
  leadDays: number;
  costFactor: number;
  co2ePerKg: number;
}

export interface SurgeInput {
  today: number;
  spikeStart: number;
  spikeDays: number;
  extraPerDay: number;
  shelfLife: number;
  minRemaining: number;
  options: SupplierOption[];
  unitCost: number;
  price: number;
  kgPerUnit: number;
  handlingBufferDays?: number;
}

export interface SurgeOption {
  option: "prebuild_primary" | "switch_faster" | "split" | "accept_shortfall";
  supplierId: string | null;
  orderedUnits: number;
  lostUnits: number;
  wasteUnits: number;
  purchaseAED: number;
  marginAED: number;
  lostMarginAED: number;
  co2eKg: number;
  note: string;
}

const r = (x: number, n: number) => Math.round(x * 10 ** n) / 10 ** n;

export function planSurge(input: SurgeInput) {
  const { today, spikeStart, spikeDays, extraPerDay, shelfLife, minRemaining, options, unitCost, price, kgPerUnit } = input;
  const buffer = input.handlingBufferDays ?? 1;
  const spikeEnd = spikeStart + spikeDays - 1;
  const sellable = Math.max(shelfLife - minRemaining, 1);
  const arrival = spikeStart - buffer;
  const coveredDays = Math.max(0, Math.min(spikeEnd, arrival + sellable - 1) - spikeStart + 1);
  const totalExtra = extraPerDay * spikeDays;
  const feasible = options.map((s) => ({ s, latest: spikeStart - s.leadDays - buffer, ok: today <= spikeStart - s.leadDays - buffer }));
  const open = feasible.filter((f) => f.ok);
  const option = (name: SurgeOption["option"], s: SupplierOption | null, covered: number, ordered: number, note: string): SurgeOption => {
    const lost = totalExtra - covered;
    return {
      option: name, supplierId: s?.id ?? null, orderedUnits: r(ordered, 2), lostUnits: r(lost, 2),
      wasteUnits: r(Math.max(ordered - covered, 0), 2), purchaseAED: r(s ? ordered * unitCost * s.costFactor : 0, 2),
      marginAED: r(covered * (price - unitCost * (s ? s.costFactor : 1)), 2), lostMarginAED: r(lost * (price - unitCost), 2),
      co2eKg: r(s ? ordered * kgPerUnit * s.co2ePerKg : 0, 3), note,
    };
  };
  const one = extraPerDay * coveredDays;
  const primaryOk = feasible[0].ok;
  const rows: SurgeOption[] = [
    option("prebuild_primary", primaryOk ? options[0] : null, primaryOk ? one : 0, primaryOk ? one : 0,
      primaryOk ? "Order window still open." : "Order window closed: primary lead time too long."),
  ];
  if (open.length) {
    const fastest = open.reduce((a, b) => (b.s.leadDays < a.s.leadDays ? b : a)).s;
    rows.push(option("switch_faster", fastest, one, one, `Fastest supplier with an open window (${fastest.id}).`));
    const secondArrival = arrival + sellable;
    const second = options.filter((s) => today + s.leadDays + buffer <= secondArrival);
    if (coveredDays < spikeDays && second.length) {
      const s2 = second.reduce((a, b) => (b.costFactor < a.costFactor ? b : a));
      rows.push(option("split", s2, totalExtra, totalExtra, `Two deliveries: day ${arrival} and day ${secondArrival} (${s2.id}).`));
    }
  }
  rows.push(option("accept_shortfall", null, 0, 0, "No extra stock: the spike's extra demand is lost."));
  return {
    latestSafeOrderDay: Object.fromEntries(feasible.map((f) => [f.s.id, f.latest])) as Record<string, number>,
    earliestUsefulArrivalDay: spikeEnd - sellable + 1,
    singleDeliveryCoversDays: coveredDays,
    minimumWarningDays: Math.min(...options.map((s) => s.leadDays)) + buffer,
    options: rows,
  };
}

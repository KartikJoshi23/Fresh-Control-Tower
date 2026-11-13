/**
 * Live feed contract: live/feed.json (implementation-plan.md §2.4).
 * A precomputed hourly stream that the Live Ops page replays as a SIMULATED FEED.
 */
import { z } from "zod";
import { Header, Id, LocalHour, NonNegative } from "./common";

export const ShelfStatus = z.enum(["in_stock", "at_risk", "expiring", "stockout"]);

/** Status severity, mapped to the reserved status colours (always shown with an icon and label). */
export const Severity = z.enum(["good", "warning", "serious", "critical"]);

export const FeedTick = z.strictObject({
  t: LocalHour,
  storeId: Id,
  skuId: Id,
  onHand: NonNegative,
  sales: NonNegative,
  receipts: NonNegative,
  waste: NonNegative,
  /** Hours of stock cover at the forecast rate; null when the forecast rate is zero. */
  coverHours: NonNegative.nullable(),
  status: ShelfStatus,
});

export const EventKind = z.enum([
  "stockout_risk",
  "stockout",
  "spike_detected",
  "expiring",
  "po_created",
  "po_received",
  "disruption",
]);

export const FeedEvent = z.strictObject({
  t: LocalHour,
  storeId: Id.nullable(),
  skuId: Id.nullable(),
  kind: EventKind,
  severity: Severity,
  message: z.string().min(1),
  poId: Id.nullable(),
});

/** Approval modes for automated replenishment (human-in-the-loop guardrails). */
export const Approval = z.enum(["auto", "needs_approval", "approved", "rejected"]);

export const PurchaseOrder = z.strictObject({
  id: Id,
  createdAt: LocalHour,
  supplierId: Id,
  storeId: Id,
  skuId: Id,
  qty: z.number().positive(),
  etaAt: LocalHour,
  approval: Approval,
  reason: z.string().min(1),
});

export const LiveFeedFile = Header.extend({
  timezone: z.literal("Asia/Dubai"),
  window: z.strictObject({ start: LocalHour, end: LocalHour }),
  storeIds: z.array(Id).min(1),
  skuIds: z.array(Id).min(1),
  ticks: z.array(FeedTick).min(1),
  events: z.array(FeedEvent),
  purchaseOrders: z.array(PurchaseOrder),
}).superRefine((feed, ctx) => {
  const poIds = new Set(feed.purchaseOrders.map((po) => po.id));
  feed.events.forEach((event, i) => {
    if (event.poId !== null && !poIds.has(event.poId)) {
      ctx.addIssue({ code: "custom", path: ["events", i, "poId"], message: `Unknown purchase order "${event.poId}"` });
    }
  });
});
export type LiveFeedFile = z.infer<typeof LiveFeedFile>;

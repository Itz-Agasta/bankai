import { z } from "zod";
import { ActorId } from "./citation";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const EquipmentRow = z.object({
  tag: z.string(),
  type: z.string(),
  location: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  voltage: z.string(),
  kva: z.nullable(z.number()),
  kw: z.nullable(z.number()),
  phase: z.number(),
  frequency: z.number(),
  drawing: z.string(),
  revision: z.string(),
});
export type EquipmentRow = z.infer<typeof EquipmentRow>;

export const DrawingRev = z.object({
  drawing: z.string(),
  revision: z.string(),
  issued: IsoDate,
  superseded_by: z.nullable(z.string()),
  superseded_on: z.nullable(IsoDate),
});
export type DrawingRev = z.infer<typeof DrawingRev>;

export const PoLine = z.object({
  po: z.string(),
  line: z.number(),
  tag: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  voltage: z.string(),
  kva: z.nullable(z.number()),
  kw: z.nullable(z.number()),
  components: z.array(z.string()),
  qty: z.number().nonnegative(),
});
export type PoLine = z.infer<typeof PoLine>;

export const Submittal = z.object({
  id: z.string(),
  tag: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  status: z.enum(["approved", "approved_as_noted", "rejected", "pending"]),
  deviations: z.array(z.string()),
});
export type Submittal = z.infer<typeof Submittal>;

// low <= likely <= high is checked by the project loader (D27), not here.
export const Activity = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.nullable(z.string()),
  duration_days: z.number().nonnegative(),
  duration_low_days: z.number().nonnegative(),
  duration_high_days: z.number().nonnegative(),
  predecessors: z.array(z.string()),
  milestone: z.boolean(),
  /** Days this activity's start is already pushed back; the loader fills 0 when absent. */
  delay_days: z.number().nonnegative().optional(),
});
export type Activity = z.infer<typeof Activity>;

export const DeliveryLine = z.object({
  ticket: z.string(),
  line: z.number(),
  po: z.string(),
  tag: z.string(),
  item: z.string(),
  qty: z.number().nonnegative(),
  driver_id: ActorId,
});
export type DeliveryLine = z.infer<typeof DeliveryLine>;

export const Decision = z.object({
  id: z.string(),
  text: z.string(),
  tag: z.nullable(z.string()),
  activity: z.nullable(z.string()),
  decided_by_role: z.nullable(ActorId),
  date: z.nullable(IsoDate),
});
export type Decision = z.infer<typeof Decision>;

export const ActionItem = z.object({
  id: z.string(),
  text: z.string(),
  owner_role: z.nullable(ActorId),
  tag: z.nullable(z.string()),
  activity: z.nullable(z.string()),
  due: z.nullable(IsoDate),
});
export type ActionItem = z.infer<typeof ActionItem>;

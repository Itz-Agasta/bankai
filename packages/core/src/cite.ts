import type { Citation, DeliveryLine, PoLine } from "@bankai/schemas";

/** One ref format per source kind, shared by linking and every rule. */
export const cite = {
  equipmentRow: (tag: string): Citation => ({
    kind: "equipment_schedule_row",
    ref: `equipment_schedule.csv#${tag}`,
  }),
  poLine: (l: PoLine): Citation => ({ kind: "po_line", ref: `${l.po}#L${l.line}` }),
  drawing: (drawing: string, revision: string): Citation => ({
    kind: "drawing",
    ref: `${drawing}@rev${revision}`,
  }),
  submittal: (id: string): Citation => ({ kind: "submittal", ref: id }),
  activity: (id: string): Citation => ({ kind: "schedule_activity", ref: id }),
  deliveryLine: (d: DeliveryLine): Citation => ({
    kind: "delivery_line",
    ref: `${d.ticket}#L${d.line}`,
  }),
};

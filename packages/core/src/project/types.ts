import type {
  ActionItem,
  Activity,
  Decision,
  DeliveryLine,
  DrawingRev,
  EquipmentRow,
  PoLine,
  Submittal,
} from "@bankai/schemas";

export interface ProjectData {
  equipment: EquipmentRow[];
  drawings: DrawingRev[];
  poLines: PoLine[];
  submittals: Submittal[];
  activities: Activity[];
  deliveries: DeliveryLine[];
  decisions: Decision[];
  actions: ActionItem[];
}

export interface Project extends ProjectData {
  name: string;
  /** Rows on the current revision of their drawing only. */
  byTag: Map<string, EquipmentRow>;
  poByTag: Map<string, PoLine>;
  activityById: Map<string, Activity>;
  currentRevision(drawing: string): DrawingRev | undefined;
  /** Every location any revision places equipment at. */
  locations: Set<string>;
}

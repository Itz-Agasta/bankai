import type {
  Activity,
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
}

export interface Project extends ProjectData {
  name: string;
  /** Rows on the current revision of their drawing only. */
  byTag: Map<string, EquipmentRow>;
  poByTag: Map<string, PoLine>;
  currentRevision(drawing: string): DrawingRev | undefined;
  /** Designed locations of current rows. */
  locations: Set<string>;
}

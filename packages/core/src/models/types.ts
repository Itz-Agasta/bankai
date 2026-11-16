import type { Field } from "@bankai/schemas";

/** Pixel box on the image the model was given. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CallCost {
  model: string;
  ms: number;
  usd: number;
}

/** A model answer plus what it cost to get it. */
export interface Metered<T> {
  value: T;
  cost: CallCost;
}

export interface Located {
  plate: BBox | null;
  tags: string[];
}

export type Fields = Partial<Record<Field, string>>;

export interface VisionModel {
  id: string;
  locate(img: Uint8Array): Promise<Metered<Located>>;
  read(img: Uint8Array): Promise<Metered<Fields>>;
  /** Which of `candidates` are visible in the photo; answers only from that list. */
  components?(img: Uint8Array, candidates: string[]): Promise<Metered<string[]>>;
}

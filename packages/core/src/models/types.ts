import type { Field, Word } from "@bankai/schemas";

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

export interface Segment {
  start: number;
  end: number;
  /** Whisper's mean token log probability; null when the provider does not return it. */
  avgLogprob: number | null;
  noSpeechProb: number | null;
}

export interface Transcript {
  words: Word[];
  segments: Segment[];
  language: string | null;
  duration: number;
}

export interface TranscriptionModel {
  id: string;
  /** `prompt` primes Whisper with the project's tags and places. */
  transcribe(audio: Uint8Array, prompt: string): Promise<Metered<Transcript>>;
}

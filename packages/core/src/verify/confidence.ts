export interface ConfidenceSignals {
  /** Share of read fields both models agreed on. */
  agreementRate: number;
  linkScore: number;
  /** Lead of the linked record over the runner-up. */
  margin: number;
  /** Share of the PO's ratings that were actually read: a partial read must not look certain. */
  ratingCoverage: number;
}

/** Hand-set blend until the calibrator is fitted (D14): plain mean of the signals, each in 0..1. */
export function confidence(f: ConfidenceSignals): number {
  const parts = [f.agreementRate, f.linkScore, Math.min(1, f.margin / 0.3), f.ratingCoverage];
  const mean = parts.reduce((s, p) => s + Math.max(0, Math.min(1, p)), 0) / parts.length;
  return Math.round(mean * 1000) / 1000;
}

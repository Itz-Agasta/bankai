import type { Field } from "@bankai/schemas";
import { firstNumber } from "../readings";

// Common LV and MV nameplate voltages (IEC and North American).
const RATING_FIELDS = new Set<Field>(["voltage", "kva", "kw", "phase", "frequency"]);

const VOLTAGES = new Set([
  110, 115, 120, 208, 220, 230, 240, 277, 347, 380, 400, 415, 440, 460, 480, 575, 600, 690, 2400,
  3300, 4160, 6600, 11000, 13200, 13800, 22000, 33000, 34500,
]);

/** Is this a value a real nameplate could carry? Implausible readings are dropped, never corrected. */
export function validateField(field: Field, value: string): boolean {
  const n = firstNumber(value);
  // firstNumber ignores a sign, so reject a minus before the first digit here.
  if (RATING_FIELDS.has(field) && /^[^\d]*-\s*\d/.test(value)) return false;
  switch (field) {
    case "voltage":
      return n !== null && VOLTAGES.has(n);
    case "frequency":
      return n === 50 || n === 60;
    case "phase":
      return n === 1 || n === 3;
    case "kva":
    case "kw":
      return n !== null && n > 0 && n < 100000;
    default:
      return value.trim().length > 0;
  }
}

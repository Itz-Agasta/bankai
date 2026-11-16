import type { Field } from "@bankai/schemas";
import { firstNumber } from "../readings";

const VOLTAGES = new Set([
  110, 120, 208, 220, 230, 240, 380, 400, 415, 440, 480, 600, 3300, 6600, 11000, 22000, 33000,
]);

/** Is this a value a real nameplate could carry? Implausible readings are dropped, never corrected. */
export function validateField(field: Field, value: string): boolean {
  const n = firstNumber(value);
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

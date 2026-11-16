import type { BankaiError } from "@bankai/schemas";

/** Thrown error that serializes to the BankaiError schema. */
export class BankaiFailure extends Error implements BankaiError {
  constructor(
    readonly code: BankaiError["code"],
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "BankaiFailure";
  }

  toJSON(): BankaiError {
    return { code: this.code, message: this.message, detail: this.detail };
  }
}

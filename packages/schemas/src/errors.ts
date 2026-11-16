import { z } from "zod";

export const BankaiError = z.object({
  code: z.enum([
    "INPUT_UNSUPPORTED",
    "INPUT_TOO_LARGE",
    "PROJECT_INVALID",
    "PERCEPTION_UNAVAILABLE",
    "NOT_FOUND",
    "APPROVAL_REQUIRED",
  ]),
  message: z.string(),
  detail: z.string().optional(),
});
export type BankaiError = z.infer<typeof BankaiError>;

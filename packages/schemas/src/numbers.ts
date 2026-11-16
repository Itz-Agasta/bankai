import { z } from "zod";

export const Confidence = z.number().min(0).max(1);
export const NonNegative = z.number().nonnegative();

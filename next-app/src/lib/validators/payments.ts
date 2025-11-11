import { z, ZodError } from "zod";

const paymentRequestSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  amount: z.coerce.number().int().min(0),
  method: z.enum(["collection", "debit"]),
  note: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .optional(),
});

export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export const parsePaymentRequest = (value: unknown): PaymentRequest => {
  try {
    return paymentRequestSchema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw error;
    }
    throw new Error("Unexpected error while parsing payment payload");
  }
};


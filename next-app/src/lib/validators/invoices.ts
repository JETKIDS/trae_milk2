import { z } from "zod";

export const invoiceActionSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  rounding_enabled: z.boolean().optional(),
});

export type InvoiceActionPayload = z.infer<typeof invoiceActionSchema>;

export const parseInvoiceActionPayload = (value: unknown): InvoiceActionPayload =>
  invoiceActionSchema.parse(value);


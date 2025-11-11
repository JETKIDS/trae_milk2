import { z } from "zod";

const changeTypeSchema = z.enum(["skip", "add", "modify"]);

export const temporaryChangeSchema = z.object({
  customer_id: z.coerce.number().int().positive(),
  change_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "change_date は YYYY-MM-DD 形式で指定してください"),
  change_type: changeTypeSchema,
  product_id: z.coerce.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().int().nullable().optional(),
  unit_price: z.coerce.number().nullable().optional(),
  reason: z.string().nullable().optional(),
});

export type TemporaryChangePayload = z.infer<typeof temporaryChangeSchema>;

export const parseTemporaryChange = (value: unknown) => temporaryChangeSchema.parse(value);


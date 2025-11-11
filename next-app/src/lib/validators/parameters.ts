import { z } from "zod";

export const pathIdSchema = z.coerce.number().int().positive();

export const parsePathId = (value: unknown) => pathIdSchema.parse(value);


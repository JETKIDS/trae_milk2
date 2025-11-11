import { z } from "zod";

const customerIdSchema = z.coerce.number().int().positive();
const courseIdSchema = z.coerce.number().int().positive();
const yearSchema = z.coerce.number().int().min(2000).max(2100);
const monthSchema = z.coerce.number().int().min(1).max(12);
const limitSchema = z.coerce.number().int().min(1).max(500).default(100);

export const parseCustomerId = (value: unknown) => customerIdSchema.parse(value);

export const parseCourseId = (value: unknown) => courseIdSchema.parse(value);

export const parseYear = (value: unknown) => yearSchema.parse(value);

export const parseMonth = (value: unknown) => monthSchema.parse(value);

export const parseLimit = (value: unknown) => limitSchema.parse(value);

export const parseYearMonth = (year: unknown, month: unknown) => ({
  year: parseYear(year),
  month: parseMonth(month),
});


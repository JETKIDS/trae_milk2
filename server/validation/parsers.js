const { z, ZodError } = require('zod');

const createValidationError = (error) => {
  if (error instanceof ZodError) {
    const message = error.issues?.[0]?.message || '入力値が不正です';
    const err = new Error(message);
    err.status = 400;
    return err;
  }
  return error;
};

const yearMonthSchema = z.object({
  year: z.coerce.number().int().min(1900).max(9999),
  month: z.coerce.number().int().min(1).max(12),
});

const customerIdSchema = z.coerce.number().int().positive();
const courseIdSchema = z.coerce.number().int().positive();

const parseYearMonth = (year, month) => {
  try {
    return yearMonthSchema.parse({ year, month });
  } catch (error) {
    throw createValidationError(error);
  }
};

const parseCustomerId = (value) => {
  try {
    return customerIdSchema.parse(value);
  } catch (error) {
    throw createValidationError(error);
  }
};

const parseCourseId = (value) => {
  try {
    return courseIdSchema.parse(value);
  } catch (error) {
    throw createValidationError(error);
  }
};

const parseCustomerIdArray = (values) => {
  try {
    return z.array(customerIdSchema).min(1).parse(values);
  } catch (error) {
    throw createValidationError(error);
  }
};

const parseWithSchema = (schema, value) => {
  try {
    return schema.parse(value);
  } catch (error) {
    throw createValidationError(error);
  }
};

module.exports = {
  parseYearMonth,
  parseCustomerId,
  parseCourseId,
  parseCustomerIdArray,
  parseWithSchema,
  yearMonthSchema,
  customerIdSchema,
  courseIdSchema,
};


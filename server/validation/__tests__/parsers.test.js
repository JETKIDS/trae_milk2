const {
  parseYearMonth,
  parseCustomerId,
  parseCourseId,
  parseCustomerIdArray,
} = require('../parsers');

describe('validation parsers', () => {
  describe('parseYearMonth', () => {
    test('returns coerced integers for valid input', () => {
      const result = parseYearMonth('2025', '6');
      expect(result).toEqual({ year: 2025, month: 6 });
    });

    test('throws validation error for invalid month', () => {
      expect(() => parseYearMonth(2025, 13)).toThrow('Number must be less than or equal to 12');
    });
  });

  describe('parseCustomerId', () => {
    test('accepts numeric string', () => {
      expect(parseCustomerId('42')).toBe(42);
    });

    test('rejects negative value', () => {
      try {
        parseCustomerId(-1);
      } catch (error) {
        expect(error.status).toBe(400);
        expect(error.message).toBe('Number must be greater than 0');
      }
    });
  });

  describe('parseCourseId', () => {
    test('coerces to positive integer', () => {
      expect(parseCourseId('7')).toBe(7);
    });
  });

  describe('parseCustomerIdArray', () => {
    test('parses array of ids', () => {
      expect(parseCustomerIdArray(['1', 2, '3'])).toEqual([1, 2, 3]);
    });

    test('throws when array empty', () => {
      expect(() => parseCustomerIdArray([])).toThrow('Array must contain at least 1 element(s)');
    });
  });
});

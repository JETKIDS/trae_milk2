import { validateHalfWidthKana, validateNumericCode } from '../../utils/validation';

describe('validation utils', () => {
  describe('validateHalfWidthKana', () => {
    it('半角カナが正常に検証される', () => {
      expect(validateHalfWidthKana('ﾃｽﾄ')).toBe(true);
      expect(validateHalfWidthKana('ｱｲｳｴｵ')).toBe(true);
      expect(validateHalfWidthKana('ﾊﾝｶｸｶﾅ')).toBe(true);
    });

    it('全角文字は無効', () => {
      expect(validateHalfWidthKana('テスト')).toBe(false);
      expect(validateHalfWidthKana('全角カナ')).toBe(false);
      expect(validateHalfWidthKana('ひらがな')).toBe(false);
    });

    it('英数字は無効', () => {
      expect(validateHalfWidthKana('test')).toBe(false);
      expect(validateHalfWidthKana('123')).toBe(false);
    });

    it('空文字は有効', () => {
      expect(validateHalfWidthKana('')).toBe(true);
    });
  });

  describe('validateNumericCode', () => {
    it('数値コードが正常に検証される', () => {
      expect(validateNumericCode('123')).toBe(true);
      expect(validateNumericCode('001')).toBe(true);
      expect(validateNumericCode('999999')).toBe(true);
    });

    it('非数値は無効', () => {
      expect(validateNumericCode('abc')).toBe(false);
      expect(validateNumericCode('12a')).toBe(false);
      expect(validateNumericCode('12.5')).toBe(false);
    });

    it('空文字は無効', () => {
      expect(validateNumericCode('')).toBe(false);
    });

    it('負の数は無効', () => {
      expect(validateNumericCode('-123')).toBe(false);
    });
  });
});

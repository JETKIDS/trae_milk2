/**
 * Validation utilities for Japanese character inputs.
 *
 * - halfKanaRegex: Half-width Katakana and half-width space only
 * - hiraganaRegex: Hiragana, spaces, middle dot (・), and long vowel mark (ー)
 */

/**
 * 半角カタカナ・半角スペースのみ許可する正規表現
 * 使用例: halfKanaRegex.test(value)
 */
export const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/;

/**
 * ひらがな・スペース・中点(・)・長音(ー)のみ許可する正規表現
 * 使用例: hiraganaRegex.test(value)
 */
export const hiraganaRegex = /^[\u3040-\u309F\s・ー]+$/;

/**
 * 半角カタカナ・半角スペースのみで構成されているかチェック
 */
export function isHalfWidthKatakanaOrSpace(value: string): boolean {
  if (!value) return false;
  return halfKanaRegex.test(value);
}

/**
 * ひらがな（スペース・中点・長音含む）のみで構成されているかチェック
 */
export function isHiragana(value: string): boolean {
  if (!value) return false;
  return hiraganaRegex.test(value);
}

export const isBankCode4 = (s: string) => /^\d{4}$/.test(s || '');
// 3桁の支店コード（半角数字のみ）
export const isBranchCode3 = (s: string) => /^\d{3}$/.test(s || '');
// 7桁の口座番号（半角数字のみ）
export const isAccountNumber7 = (s: string) => /^\d{7}$/.test(s || '');
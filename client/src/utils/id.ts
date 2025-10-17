// 顧客IDを常に7桁で表示するための共通ユーティリティ
// 任意の入力（文字列・数値・undefined/null）から数字のみを抽出し、先頭ゼロ埋めで7桁に整形します。
// 例: '123' -> '0000123', '12-34' -> '0001234', undefined -> '0000000'
export function pad7(customId?: string | number): string {
  const s = customId == null ? '' : String(customId);
  const digits = s.replace(/\D/g, '');
  // 7桁にゼロ埋めし、万一桁数が多い場合は末尾7桁を採用
  const padded = digits.padStart(7, '0');
  return padded.slice(-7);
}
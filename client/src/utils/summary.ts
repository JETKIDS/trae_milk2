// テーブル集計用の共通関数

// rows: { daily_quantities?: Record<string, number> }[] を想定
export function computeDayTotalsForRows<T extends { daily_quantities?: Record<string, number> }>(rows: T[], dateChunk: string[]): number[] {
  return dateChunk.map(date => rows.reduce((sum, r) => sum + (r.daily_quantities?.[date] || 0), 0));
}

export function computeGrandTotalQuantity<T extends { total_quantity: number }>(rows: T[]): number {
  return rows.reduce((sum, r) => sum + (Number(r.total_quantity) || 0), 0);
}

export function computeGrandTotalAmount<T extends { total_amount: number }>(rows: T[]): number {
  return rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
}



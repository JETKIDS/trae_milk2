export function getPrevYearMonth(year: number, month: number) {
  // month: 1-12
  const d = new Date(year, month - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function parseMonthInput(monthStr: string): { year: number; month: number } | null {
  // monthStr: 'YYYY-MM'
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
  const y = parseInt(monthStr.slice(0, 4), 10);
  const m = parseInt(monthStr.slice(5, 7), 10);
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, month: m };
}



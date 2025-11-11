import moment from "moment";

type PatternRow = {
  product_id: number;
  product_name: string;
  unit: string | null;
  unit_price: number;
  delivery_days: unknown;
  daily_quantities: unknown;
  start_date: string | null;
  end_date: string | null;
  quantity: number | null;
};

type TemporaryChangeRow = {
  change_date: string;
  change_type: "skip" | "add" | "modify";
  product_id: number | null;
  product_name: string;
  quantity: number | null;
  unit_price: number | null;
  product_unit_price: number | null;
  unit: string | null;
  created_at?: string | null;
};

type CalendarProduct = {
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string | null;
  amount: number;
};

export type CalendarDay = {
  date: string;
  day: number;
  dayOfWeek: number;
  products: CalendarProduct[];
};

const safeParse = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const ensureArrayDays = (value: unknown): number[] => {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    const parsed = safeParse(value);
    if (Array.isArray(parsed)) return parsed as number[];
    if (typeof parsed === "string") {
      const reParsed = safeParse(parsed);
      if (Array.isArray(reParsed)) return reParsed as number[];
    }
  }
  return [];
};

const ensureObject = (value: unknown): Record<string, number> => {
  if (!value) return {};
  if (typeof value === "object") return (value as Record<string, number>) || {};
  if (typeof value === "string") {
    const parsed = safeParse(value);
    if (parsed && typeof parsed === "object") return parsed as Record<string, number>;
    if (typeof parsed === "string") {
      const reParsed = safeParse(parsed);
      if (reParsed && typeof reParsed === "object") return reParsed as Record<string, number>;
    }
  }
  return {};
};

const isWithinPattern = (current: moment.Moment, pattern: PatternRow) => {
  const start = pattern.start_date ? moment(pattern.start_date) : null;
  const end = pattern.end_date ? moment(pattern.end_date) : null;

  if (start && current.isBefore(start, "day")) return false;
  if (end && current.isAfter(end, "day")) return false;
  return true;
};

export const generateMonthlyCalendar = (
  year: number,
  month: number,
  patterns: PatternRow[],
  temporaryChanges: TemporaryChangeRow[] = [],
): CalendarDay[] => {
  const startDate = moment(`${year}-${month.toString().padStart(2, "0")}-01`);
  const endDate = startDate.clone().endOf("month");
  const calendar: CalendarDay[] = [];

  for (let date = startDate.clone(); date.isSameOrBefore(endDate); date.add(1, "day")) {
    const dayOfWeek = date.day();
    const dateStr = date.format("YYYY-MM-DD");
    const current = moment(dateStr);

    const dayEntry: CalendarDay = {
      date: dateStr,
      day: date.date(),
      dayOfWeek,
      products: [],
    };

    const activePatterns = (patterns || []).filter((pattern) => isWithinPattern(current, pattern));
    const bestPatternByProduct = new Map<number, PatternRow>();

    activePatterns.forEach((pattern) => {
      const key = pattern.product_id;
      const existing = bestPatternByProduct.get(key);

      if (!existing) {
        bestPatternByProduct.set(key, pattern);
        return;
      }

      const existingStart = existing.start_date ? moment(existing.start_date) : null;
      const patternStart = pattern.start_date ? moment(pattern.start_date) : null;

      if (!existingStart || (patternStart && patternStart.isAfter(existingStart))) {
        bestPatternByProduct.set(key, pattern);
      }
    });

    for (const pattern of bestPatternByProduct.values()) {
      let quantity = 0;
      if (pattern.daily_quantities) {
        const dailyQuantities = ensureObject(pattern.daily_quantities);
        quantity = Number(dailyQuantities[dayOfWeek] || 0);
      } else {
        const deliveryDays = ensureArrayDays(pattern.delivery_days);
        if (deliveryDays.includes(dayOfWeek)) {
          quantity = pattern.quantity || 0;
        }
      }

      const changesForProduct = temporaryChanges.filter(
        (change) => change.change_date === dateStr && change.product_id === pattern.product_id,
      );

      const hasSkip = changesForProduct.some((change) => change.change_type === "skip");
      if (hasSkip) {
        quantity = 0;
      } else {
        const modifyChanges = changesForProduct
          .filter((change) => change.change_type === "modify" && change.quantity !== null && change.quantity !== undefined)
          .sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bTime - aTime;
          });

        if (modifyChanges.length > 0) {
          const latest = modifyChanges[0];
          quantity = Number(latest.quantity) || 0;
          if (latest.unit_price !== null && latest.unit_price !== undefined) {
            pattern.unit_price = Number(latest.unit_price);
          }
        }
      }

      if (quantity > 0) {
        dayEntry.products.push({
          productName: pattern.product_name,
          quantity,
          unitPrice: pattern.unit_price,
          unit: pattern.unit,
          amount: quantity * pattern.unit_price,
        });
      }
    }

    temporaryChanges
      .filter(
        (change) =>
          change.change_date === dateStr &&
          change.change_type === "add" &&
          change.quantity !== null &&
          change.quantity !== undefined &&
          change.quantity > 0,
      )
      .forEach((change) => {
        const unitPrice =
          change.unit_price !== null && change.unit_price !== undefined
            ? Number(change.unit_price)
            : Number(change.product_unit_price ?? 0);
        const quantity = Number(change.quantity ?? 0);
        dayEntry.products.push({
          productName: `（臨時）${change.product_name}`,
          quantity,
          unitPrice,
          unit: change.unit,
          amount: quantity * unitPrice,
        });
      });

    calendar.push(dayEntry);
  }

  return calendar;
};


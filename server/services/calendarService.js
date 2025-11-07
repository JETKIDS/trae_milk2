const moment = require('moment');

const safeParse = (val) => {
  try {
    return JSON.parse(val);
  } catch (error) {
    return val;
  }
};

const ensureArrayDays = (days) => {
  if (Array.isArray(days)) return days;
  if (typeof days === 'string') {
    const p1 = safeParse(days);
    if (Array.isArray(p1)) return p1;
    if (typeof p1 === 'string') {
      const p2 = safeParse(p1);
      if (Array.isArray(p2)) return p2;
    }
  }
  return [];
};

const ensureObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value || {};
  if (typeof value === 'string') {
    const p1 = safeParse(value);
    if (p1 && typeof p1 === 'object') return p1;
    if (typeof p1 === 'string') {
      const p2 = safeParse(p1);
      if (p2 && typeof p2 === 'object') return p2;
    }
  }
  return {};
};

const generateMonthlyCalendar = (year, month, patterns, temporaryChanges = []) => {
  const startDate = moment(`${year}-${month.toString().padStart(2, '0')}-01`);
  const endDate = startDate.clone().endOf('month');
  const calendar = [];

  for (let date = startDate.clone(); date.isSameOrBefore(endDate); date.add(1, 'day')) {
    const dayOfWeek = date.day();
    const currentDateStr = date.format('YYYY-MM-DD');
    const dayData = {
      date: currentDateStr,
      day: date.date(),
      dayOfWeek,
      products: [],
    };

    const validPatterns = (patterns || []).filter((pattern) => {
      if (pattern.start_date && moment(currentDateStr).isBefore(moment(pattern.start_date))) return false;
      if (pattern.end_date && moment(currentDateStr).isAfter(moment(pattern.end_date))) return false;
      return true;
    });

    const bestPatternByProduct = new Map();
    const currentDate = moment(currentDateStr);

    validPatterns.forEach((pattern) => {
      const key = pattern.product_id;
      const existing = bestPatternByProduct.get(key);
      const patternStart = moment(pattern.start_date);
      const patternEnd = pattern.end_date ? moment(pattern.end_date) : null;
      const patternValid = currentDate.isSameOrAfter(patternStart, 'day')
        && (!patternEnd || currentDate.isSameOrBefore(patternEnd, 'day'));

      if (!existing) {
        if (patternValid) {
          bestPatternByProduct.set(key, pattern);
        }
        return;
      }

      const existingStart = moment(existing.start_date);
      const existingEnd = existing.end_date ? moment(existing.end_date) : null;
      const existingValid = currentDate.isSameOrAfter(existingStart, 'day')
        && (!existingEnd || currentDate.isSameOrBefore(existingEnd, 'day'));

      if (existingValid && patternStart.isAfter(currentDate, 'day')) {
        return;
      }

      if (patternValid && (!existingValid || patternStart.isAfter(existingStart, 'day'))) {
        bestPatternByProduct.set(key, pattern);
      }
    });

    Array.from(bestPatternByProduct.values()).forEach((pattern) => {
      let quantity = 0;
      if (pattern.daily_quantities) {
        const dailyQuantities = ensureObject(pattern.daily_quantities);
        quantity = dailyQuantities[dayOfWeek] || 0;
      } else {
        const deliveryDays = ensureArrayDays(pattern.delivery_days || []);
        if (deliveryDays.includes(dayOfWeek)) {
          quantity = pattern.quantity || 0;
        }
      }

      const dayChangesForProduct = (temporaryChanges || [])
        .filter((change) => change.change_date === currentDateStr && change.product_id === pattern.product_id);

      const hasSkip = dayChangesForProduct.some((change) => change.change_type === 'skip');
      if (hasSkip) {
        quantity = 0;
      } else {
        const modifyChanges = dayChangesForProduct
          .filter((change) => change.change_type === 'modify' && change.quantity !== null && change.quantity !== undefined)
          .sort((a, b) => {
            const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bTime - aTime;
          });
        if (modifyChanges.length > 0) {
          const latestModify = modifyChanges[0];
          quantity = Number(latestModify.quantity) || 0;
          if (latestModify.unit_price !== null && latestModify.unit_price !== undefined) {
            // eslint-disable-next-line no-param-reassign
            pattern.unit_price = latestModify.unit_price;
          }
        }
      }

      if (quantity > 0) {
        dayData.products.push({
          productName: pattern.product_name,
          quantity,
          unitPrice: pattern.unit_price,
          unit: pattern.unit,
          amount: quantity * pattern.unit_price,
        });
      }
    });

    (temporaryChanges || []).forEach((change) => {
      if (
        change.change_date === currentDateStr
        && change.change_type === 'add'
        && change.quantity > 0
      ) {
        const unitPrice = change.unit_price !== null && change.unit_price !== undefined
          ? change.unit_price
          : change.product_unit_price;
        dayData.products.push({
          productName: `（臨時）${change.product_name}`,
          quantity: change.quantity,
          unitPrice,
          unit: change.unit,
          amount: change.quantity * unitPrice,
        });
      }
    });

    calendar.push(dayData);
  }

  return calendar;
};

module.exports = {
  generateMonthlyCalendar,
};


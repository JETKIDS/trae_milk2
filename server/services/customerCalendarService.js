const {
  withDb,
  dbAll,
  dbGet,
} = require('../utils/db');
const { generateMonthlyCalendar } = require('./calendarService');

const toInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseYearMonth = (year, month) => {
  const y = toInt(year);
  const m = toInt(month);
  if (!y || !m || m < 1 || m > 12) {
    const error = new Error('year/month の形式が不正です');
    error.status = 400;
    throw error;
  }
  return { y, m };
};

const fetchCustomerBase = async (db, customerId) => {
  const customer = await dbGet(
    db,
    `
      SELECT c.*, dc.course_name, ds.staff_name
      FROM customers c
      LEFT JOIN delivery_courses dc ON c.course_id = dc.id
      LEFT JOIN delivery_staff ds ON c.staff_id = ds.id
      WHERE c.id = ?
    `,
    [customerId],
  );
  if (!customer) {
    const error = new Error('顧客が見つかりません');
    error.status = 404;
    throw error;
  }
  return customer;
};

const fetchPatterns = (db, customerId) => dbAll(
  db,
  `
    SELECT dp.*, p.product_name, p.unit, m.manufacturer_name
    FROM delivery_patterns dp
    JOIN products p ON dp.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE dp.customer_id = ? AND dp.is_active = 1
  `,
  [customerId],
);

const fetchTemporaryChanges = (db, customerId, year, month) => dbAll(
  db,
  `
    SELECT
      tc.*,
      p.product_name,
      p.unit_price AS product_unit_price,
      p.unit,
      m.manufacturer_name
    FROM temporary_changes tc
    JOIN products p ON tc.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE tc.customer_id = ?
      AND strftime('%Y', tc.change_date) = ?
      AND strftime('%m', tc.change_date) = ?
  `,
  [customerId, String(year), String(month).padStart(2, '0')],
);

const getCustomerCalendar = async (customerId, year, month) => withDb(async (db) => {
  const cid = toInt(customerId);
  if (!cid) {
    const error = new Error('顧客IDが不正です');
    error.status = 400;
    throw error;
  }

  const { y, m } = parseYearMonth(year, month);

  const customer = await fetchCustomerBase(db, cid);
  const patterns = await fetchPatterns(db, cid);
  const temporaryChanges = await fetchTemporaryChanges(db, cid, y, m);
  const calendar = generateMonthlyCalendar(y, m, patterns, temporaryChanges);

  return {
    customer,
    calendar,
    temporaryChanges,
  };
});

const getCourseCalendars = async (courseId, year, month) => withDb(async (db) => {
  const cid = toInt(courseId);
  if (!cid) {
    const error = new Error('courseId が不正です');
    error.status = 400;
    throw error;
  }

  const { y, m } = parseYearMonth(year, month);

  const customers = await dbAll(
    db,
    `
      SELECT c.*, dc.course_name
      FROM customers c
      LEFT JOIN delivery_courses dc ON c.course_id = dc.id
      WHERE c.course_id = ?
      ORDER BY c.delivery_order ASC, c.id ASC
    `,
    [cid],
  );

  const items = [];
  for (const customer of customers) {
    const patterns = await fetchPatterns(db, customer.id);
    const temporaryChanges = await fetchTemporaryChanges(db, customer.id, y, m);
    const calendar = generateMonthlyCalendar(y, m, patterns, temporaryChanges);
    items.push({
      customer,
      customer_id: customer.id,
      calendar,
      temporaryChanges,
      patterns,
    });
  }

  return {
    year: y,
    month: m,
    items,
  };
});

module.exports = {
  getCustomerCalendar,
  getCourseCalendars,
};


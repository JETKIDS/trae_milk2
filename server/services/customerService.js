const { withDb, dbAll, dbGet } = require('../utils/db');
const { ensureSchema: ensureCustomerSettingsSchema, getCustomerSettingsByCustomerId } = require('./customerSettingsService');

const BASE_CUSTOMER_SELECT = `
  SELECT c.*, dc.course_name, ds.staff_name
  FROM customers c
  LEFT JOIN delivery_courses dc ON c.course_id = dc.id
  LEFT JOIN delivery_staff ds ON c.staff_id = ds.id
`;

const buildSearchFilters = (filters = {}) => {
  const where = [];
  const params = [];

  if (filters.searchId && filters.searchId.trim() !== '') {
    const idTerm = filters.searchId.trim();
    if (/^\d+$/.test(idTerm)) {
      where.push('c.custom_id = ?');
      params.push(idTerm.padStart(7, '0'));
    } else {
      where.push('c.custom_id LIKE ?');
      params.push(`%${idTerm}%`);
    }
  }

  if (filters.searchName && filters.searchName.trim() !== '') {
    const nameTerm = filters.searchName.trim();
    where.push('(c.customer_name LIKE ? OR c.yomi LIKE ?)');
    params.push(`${nameTerm}%`, `${nameTerm}%`);
  }

  if (filters.searchAddress && filters.searchAddress.trim() !== '') {
    where.push('c.address LIKE ?');
    params.push(`%${filters.searchAddress.trim()}%`);
  }

  if (filters.searchPhone && filters.searchPhone.trim() !== '') {
    where.push('c.phone LIKE ?');
    params.push(`%${filters.searchPhone.trim()}%`);
  }

  return {
    whereSql: where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '',
    params,
  };
};

const buildSortClause = (sortKey = 'yomi') => {
  const key = String(sortKey || 'yomi').toLowerCase();
  if (key === 'id') {
    return ' ORDER BY c.custom_id ASC';
  }
  if (key === 'course') {
    return ' ORDER BY dc.course_name ASC, c.delivery_order ASC, CASE WHEN c.yomi IS NOT NULL AND c.yomi <> "" THEN c.yomi ELSE c.customer_name END ASC';
  }
  return ' ORDER BY CASE WHEN c.yomi IS NOT NULL AND c.yomi <> "" THEN c.yomi ELSE c.customer_name END ASC';
};

const fetchCustomers = async (filters = {}) => withDb(async (db) => {
  const { whereSql, params } = buildSearchFilters(filters);
  const sortClause = buildSortClause(filters.sort);
  const sql = `${BASE_CUSTOMER_SELECT}${whereSql}${sortClause}`;
  return dbAll(db, sql, params);
});

const fetchCustomersPaged = async (filters = {}) => {
  const pageNum = Math.max(parseInt(filters.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(filters.pageSize, 10) || 50, 1), 200);
  const offset = (pageNum - 1) * pageSize;

  return withDb(async (db) => {
    const { whereSql, params } = buildSearchFilters(filters);
    const sortClause = buildSortClause(filters.sort);

    const countSql = `SELECT COUNT(*) as total FROM customers c${whereSql}`;
    const totalRow = await dbGet(db, countSql, params);
    const total = totalRow?.total || 0;

    const dataSql = `${BASE_CUSTOMER_SELECT}${whereSql}${sortClause} LIMIT ? OFFSET ?`;
    const items = await dbAll(db, dataSql, [...params, pageSize, offset]);

    return {
      items,
      total,
      page: pageNum,
      pageSize,
    };
  });
};

const fetchNextCustomerId = async () => withDb(async (db) => {
  const rows = await dbAll(db, `
    SELECT custom_id
    FROM customers
    WHERE LENGTH(custom_id) = 7 AND custom_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  `);
  const used = new Set(rows.map((r) => parseInt(r.custom_id, 10)).filter((n) => !Number.isNaN(n)));
  let candidate = 1;
  while (candidate <= 9_999_999 && used.has(candidate)) {
    candidate += 1;
  }
  return candidate <= 9_999_999 ? candidate.toString().padStart(7, '0') : null;
});

const fetchCustomerDetail = async (customerId) => withDb(async (db) => {
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

  const patterns = await dbAll(
    db,
    `
      SELECT dp.*, p.product_name, p.unit, m.manufacturer_name, m.id AS manufacturer_id
      FROM delivery_patterns dp
      JOIN products p ON dp.product_id = p.id
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE dp.customer_id = ? AND dp.is_active = 1
    `,
    [customerId],
  );

  await ensureCustomerSettingsSchema(db);
  const settings = await getCustomerSettingsByCustomerId(db, customerId);

  return {
    customer,
    patterns,
    settings: settings || null,
  };
});

module.exports = {
  fetchCustomers,
  fetchCustomersPaged,
  fetchNextCustomerId,
  fetchCustomerDetail,
};


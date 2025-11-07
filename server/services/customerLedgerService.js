const moment = require('moment');
const {
  withDb,
  dbAll,
  dbExec,
  dbGet,
  dbRun,
} = require('../utils/db');
const { generateMonthlyCalendar } = require('./calendarService');
const {
  parseYearMonth,
  parseCustomerId,
  parseCourseId,
  parseCustomerIdArray,
} = require('../validation/parsers');

const ensureLedgerTables = async (db) => {
  const baseSql = `
    CREATE TABLE IF NOT EXISTS ar_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      rounding_enabled INTEGER NOT NULL,
      status TEXT DEFAULT 'confirmed',
      confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(customer_id, year, month),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS ar_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT CHECK (method IN ('collection','debit')),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `;

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.exec(baseSql, (err) => {
        if (err) {
          reject(err);
          return;
        }

        db.all("PRAGMA table_info(ar_invoices)", [], async (invoiceErr, invoiceCols) => {
          if (invoiceErr) {
            reject(invoiceErr);
            return;
          }
          const invoiceColumnNames = new Set((invoiceCols || []).map((col) => col.name));
          const alterStatements = [];

          if (!invoiceColumnNames.has('status')) {
            alterStatements.push("ALTER TABLE ar_invoices ADD COLUMN status TEXT DEFAULT 'confirmed'");
          }
          if (!invoiceColumnNames.has('confirmed_at')) {
            alterStatements.push("ALTER TABLE ar_invoices ADD COLUMN confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP");
          }
          if (!invoiceColumnNames.has('rounding_enabled')) {
            alterStatements.push("ALTER TABLE ar_invoices ADD COLUMN rounding_enabled INTEGER DEFAULT 0");
          }

          db.all("PRAGMA table_info(ar_payments)", [], async (paymentErr, paymentCols) => {
            if (paymentErr) {
              reject(paymentErr);
              return;
            }

            const paymentColumnNames = new Set((paymentCols || []).map((col) => col.name));
            if (!paymentColumnNames.has('method')) {
              alterStatements.push("ALTER TABLE ar_payments ADD COLUMN method TEXT");
            }
            if (!paymentColumnNames.has('note')) {
              alterStatements.push("ALTER TABLE ar_payments ADD COLUMN note TEXT");
            }
            if (!paymentColumnNames.has('created_at')) {
              alterStatements.push("ALTER TABLE ar_payments ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
            }

            if (alterStatements.length === 0) {
              resolve();
              return;
            }

            const alterSql = alterStatements.join('; ');
            db.exec(alterSql, (alterErr) => {
              if (alterErr) {
                reject(alterErr);
                return;
              }
              resolve();
            });
          });
        });
      });
    });
  });
};

let ledgerInitPromise = null;

const ensureLedgerInitialized = async () => {
  if (!ledgerInitPromise) {
    ledgerInitPromise = withDb((db) => ensureLedgerTables(db)).catch((error) => {
      ledgerInitPromise = null;
      throw error;
    });
  }
  return ledgerInitPromise;
};

const computeMonthlyTotal = async (db, customerId, year, month) => {
  const patterns = await dbAll(
    db,
    `
      SELECT dp.*, p.product_name, p.unit, m.manufacturer_name
      FROM delivery_patterns dp
      JOIN products p ON dp.product_id = p.id
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE dp.customer_id = ?
    `,
    [customerId],
  );

  const temporaryChanges = await dbAll(
    db,
    `
      SELECT tc.*, p.product_name, p.unit_price AS product_unit_price, p.unit, m.manufacturer_name
      FROM temporary_changes tc
      JOIN products p ON tc.product_id = p.id
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE tc.customer_id = ?
        AND strftime('%Y', tc.change_date) = ?
        AND strftime('%m', tc.change_date) = ?
    `,
    [customerId, String(year), String(month).padStart(2, '0')],
  );

  const calendar = generateMonthlyCalendar(year, month, patterns, temporaryChanges);
  return calendar.reduce(
    (sum, day) => sum + day.products.reduce((subtotal, product) => subtotal + (product.amount || 0), 0),
    0,
  );
};

const getCustomerRoundingSetting = async (db, customerId) => {
  const row = await dbGet(db, 'SELECT rounding_enabled FROM customer_settings WHERE customer_id = ?', [customerId]);
  return row ? row.rounding_enabled === 1 : true;
};

const buildCarryoverAmount = async (db, customerId, year, month, roundingEnabled) => {
  const previousMonth = moment(`${year}-${String(month).padStart(2, '0')}-01`).subtract(1, 'month');
  const prevYear = Number.parseInt(previousMonth.format('YYYY'), 10);
  const prevMonth = Number.parseInt(previousMonth.format('MM'), 10);

  const prevInvoiceRow = await dbGet(
    db,
    'SELECT amount FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?',
    [customerId, prevYear, prevMonth],
  );

  let prevInvoiceAmount;
  if (prevInvoiceRow && typeof prevInvoiceRow.amount === 'number') {
    prevInvoiceAmount = prevInvoiceRow.amount;
  } else {
    const prevRaw = await computeMonthlyTotal(db, customerId, prevYear, prevMonth);
    prevInvoiceAmount = roundingEnabled ? Math.floor(prevRaw / 10) * 10 : prevRaw;
  }

  const currentPaymentRow = await dbGet(
    db,
    'SELECT COALESCE(SUM(amount), 0) AS total FROM ar_payments WHERE customer_id = ? AND year = ? AND month = ?',
    [customerId, year, month],
  );
  const currentPayments = currentPaymentRow ? currentPaymentRow.total || 0 : 0;

  return (prevInvoiceAmount || 0) - currentPayments;
};

const upsertInvoice = async (db, customerId, year, month, amount, roundingEnabled) => {
  const sql = `
    INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status)
    VALUES (?, ?, ?, ?, ?, 'confirmed')
    ON CONFLICT(customer_id, year, month) DO UPDATE SET
      amount = excluded.amount,
      rounding_enabled = excluded.rounding_enabled,
      status = 'confirmed',
      confirmed_at = CURRENT_TIMESTAMP
  `;

  await dbRun(db, sql, [customerId, year, month, amount, roundingEnabled ? 1 : 0]);
};

const confirmInvoiceRecord = async (db, customerId, year, month) => {
  const roundingEnabled = await getCustomerRoundingSetting(db, customerId);
  const totalRaw = await computeMonthlyTotal(db, customerId, year, month);
  const amountRaw = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
  const baseAmount = Math.max(0, amountRaw);
  const carryover = await buildCarryoverAmount(db, customerId, year, month, roundingEnabled);
  const amount = baseAmount + carryover;

  await upsertInvoice(db, customerId, year, month, amount, roundingEnabled);

  return {
    customer_id: Number(customerId),
    year,
    month,
    amount,
    rounding_enabled: roundingEnabled,
    carryover_included: carryover,
  };
};

const confirmInvoice = async (customerId, year, month) => withDb(async (db) => {
  const cid = parseCustomerId(customerId);
  const { year: y, month: m } = parseYearMonth(year, month);
  await ensureLedgerInitialized();
  return confirmInvoiceRecord(db, cid, y, m);
});

const selectBatchTargets = async (db, { courseId, customerIds }) => {
  if (Array.isArray(customerIds) && customerIds.length > 0) {
    return parseCustomerIdArray(customerIds);
  }

  if (courseId !== undefined && courseId !== null && courseId !== '') {
    const course = parseCourseId(courseId);
    const rows = await dbAll(db, 'SELECT id FROM customers WHERE course_id = ?', [course]);
    return rows.map((row) => row.id);
  }

  const rows = await dbAll(db, 'SELECT id FROM customers', []);
  return rows.map((row) => row.id);
};

const confirmInvoicesBatch = async ({ year, month, course_id, customer_ids }) => withDb(async (db) => {
  const { year: y, month: m } = parseYearMonth(year, month);

  await ensureLedgerInitialized();
  const targets = await selectBatchTargets(db, { courseId: course_id, customerIds: customer_ids });

  await dbRun(db, 'BEGIN');
  const results = [];
  try {
    for (const customerId of targets) {
      const record = await confirmInvoiceRecord(db, customerId, y, m);
      results.push(record);
    }
    await dbRun(db, 'COMMIT');
  } catch (error) {
    await dbRun(db, 'ROLLBACK');
    throw error;
  }

  return { year: y, month: m, count: targets.length, results };
});

const unconfirmInvoice = async (customerId, year, month) => withDb(async (db) => {
  const cid = parseCustomerId(customerId);
  const { year: y, month: m } = parseYearMonth(year, month);

  await ensureLedgerInitialized();
  await dbRun(db, 'DELETE FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?', [cid, y, m]);
  return { customer_id: cid, year: y, month: m, removed: true };
});

const unconfirmInvoicesBatch = async ({ year, month, course_id, customer_ids }) => withDb(async (db) => {
  const { year: y, month: m } = parseYearMonth(year, month);

  await ensureLedgerInitialized();
  const targets = await selectBatchTargets(db, { courseId: course_id, customerIds: customer_ids });

  await dbRun(db, 'BEGIN');
  const results = [];
  try {
    for (const customerId of targets) {
      const removed = await dbRun(
        db,
        'DELETE FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?',
        [customerId, y, m],
      );
      results.push({ customer_id: customerId, year: y, month: m, removed_count: removed.changes || 0 });
    }
    await dbRun(db, 'COMMIT');
  } catch (error) {
    await dbRun(db, 'ROLLBACK');
    throw error;
  }

  return { year: y, month: m, count: targets.length, results };
});

const getInvoiceStatus = async (customerId, year, month) => withDb(async (db) => {
  const cid = parseCustomerId(customerId);
  const { year: y, month: m } = parseYearMonth(year, month);

  await ensureLedgerInitialized();
  const row = await dbGet(
    db,
    'SELECT amount, rounding_enabled, confirmed_at FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?',
    [cid, y, m],
  );

  if (row) {
    return {
      confirmed: true,
      amount: row.amount,
      rounding_enabled: row.rounding_enabled === 1,
      confirmed_at: row.confirmed_at,
    };
  }
  return { confirmed: false };
});

const getCourseInvoiceAmounts = async (courseId, year, month, method) => withDb(async (db) => {
  const cid = parseCourseId(courseId);
  const { year: y, month: m } = parseYearMonth(year, month);
  const methodStr = method === 'debit' ? 'debit' : 'collection';

  await ensureLedgerInitialized();
  const customers = await dbAll(
    db,
    `
      SELECT c.id, c.custom_id, c.customer_name, cs.rounding_enabled
      FROM customers c
      LEFT JOIN customer_settings cs ON cs.customer_id = c.id
      WHERE c.course_id = ? AND COALESCE(cs.billing_method, 'collection') = ?
      ORDER BY c.delivery_order ASC, c.id ASC
    `,
    [cid, methodStr],
  );

  const items = [];
  for (const customer of customers) {
    const roundingEnabled = customer.rounding_enabled === 1
      || customer.rounding_enabled === null
      || typeof customer.rounding_enabled === 'undefined'
      ? true
      : customer.rounding_enabled === 1;

    const invoice = await dbGet(
      db,
      'SELECT amount, status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?',
      [customer.id, y, m],
    );

    let amount;
    let confirmed = false;
    if (invoice && typeof invoice.amount === 'number') {
      amount = invoice.amount;
      confirmed = String(invoice.status || 'confirmed') === 'confirmed';
    } else {
      const totalRaw = await computeMonthlyTotal(db, customer.id, y, m);
      amount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
    }

    items.push({
      customer_id: customer.id,
      amount,
      confirmed,
      rounding_enabled: roundingEnabled ? 1 : 0,
    });
  }

  return { year: y, month: m, method: methodStr, items };
});

const getCourseInvoiceStatuses = async (courseId, year, month) => withDb(async (db) => {
  const cid = parseCourseId(courseId);
  const { year: y, month: m } = parseYearMonth(year, month);

  await ensureLedgerInitialized();
  const rows = await dbAll(
    db,
    `
      SELECT c.id AS customer_id,
             ai.amount AS amount,
             ai.rounding_enabled AS rounding_enabled,
             ai.status AS status
      FROM customers c
      LEFT JOIN ar_invoices ai
        ON ai.customer_id = c.id AND ai.year = ? AND ai.month = ?
      WHERE c.course_id = ?
      ORDER BY c.delivery_order ASC, c.id ASC
    `,
    [y, m, cid],
  );

  return {
    year: y,
    month: m,
    items: rows.map((row) => ({
      customer_id: row.customer_id,
      confirmed: String(row.status || '') === 'confirmed',
      amount: typeof row.amount === 'number' ? row.amount : null,
      rounding_enabled: typeof row.rounding_enabled === 'number' ? row.rounding_enabled : null,
    })),
  };
});

const getCoursePaymentsSum = async (courseId, year, month) => withDb(async (db) => {
  const cid = parseCourseId(courseId);
  const { year: y, month: m } = parseYearMonth(year, month);

  await ensureLedgerInitialized();
  const rows = await dbAll(
    db,
    `
      SELECT c.id AS customer_id, COALESCE(SUM(p.amount), 0) AS total
      FROM customers c
      LEFT JOIN ar_payments p
        ON p.customer_id = c.id AND p.year = ? AND p.month = ?
      WHERE c.course_id = ?
      GROUP BY c.id
      ORDER BY c.delivery_order ASC, c.id ASC
    `,
    [y, m, cid],
  );

  return { year: y, month: m, items: rows };
});

module.exports = {
  ensureLedgerTables,
  computeMonthlyTotal,
  getCustomerRoundingSetting,
  buildCarryoverAmount,
  confirmInvoiceRecord,
  confirmInvoice,
  confirmInvoicesBatch,
  unconfirmInvoice,
  unconfirmInvoicesBatch,
  getInvoiceStatus,
  getCourseInvoiceAmounts,
  getCourseInvoiceStatuses,
  getCoursePaymentsSum,
  ensureLedgerInitialized,
  initializeLedgerSchema: ensureLedgerInitialized,
};


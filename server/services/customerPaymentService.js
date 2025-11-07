const { getPrevYearMonth } = require('../utils/ar');
const {
  withDb,
  dbAll,
  dbGet,
  dbRun,
} = require('../utils/db');
const {
  ensureLedgerTables,
} = require('./customerLedgerService');

const toInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const isPositiveInt = (value) => {
  const parsed = toInt(value);
  return parsed !== null && parsed > 0;
};

const registerBatchPayments = async ({ year, month, entries, method }) => withDb(async (db) => {
  const y = toInt(year);
  const m = toInt(month);
  if (!y || !m || m < 1 || m > 12) {
    const error = new Error('year/month の形式が不正です');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    const error = new Error('entries は必須です');
    error.status = 400;
    throw error;
  }

  const methodStr = method === 'debit' ? 'debit' : 'collection';

  await ensureLedgerTables(db);

  const { year: prevYear, month: prevMonth } = getPrevYearMonth(y, m);
  const confirmedRows = await dbAll(
    db,
    'SELECT customer_id FROM ar_invoices WHERE year = ? AND month = ? AND status = "confirmed"',
    [prevYear, prevMonth],
  );
  const confirmedSet = new Set((confirmedRows || []).map((row) => Number(row.customer_id)));

  let success = 0;
  let failed = 0;

  await dbRun(db, 'BEGIN TRANSACTION');
  try {
    for (const entry of entries) {
      const customerId = toInt(entry.customer_id);
      const amount = toInt(entry.amount);
      const note = entry.note ? String(entry.note) : null;

      if (customerId === null || amount === null || amount <= 0) {
        failed += 1;
        continue;
      }

      if (!confirmedSet.has(customerId)) {
        failed += 1;
        continue;
      }

      try {
        await dbRun(
          db,
          `INSERT INTO ar_payments (customer_id, year, month, amount, method, note)
             VALUES (?, ?, ?, ?, ?, ?)`,
          [customerId, y, m, amount, methodStr, note],
        );
        success += 1;
      } catch (error) {
        failed += 1;
      }
    }

    await dbRun(db, 'COMMIT');
  } catch (error) {
    await dbRun(db, 'ROLLBACK');
    throw error;
  }

  return { year: y, month: m, method: methodStr, success, failed };
});

const registerPayment = async (customerId, { year, month, amount, method, note }) => withDb(async (db) => {
  const cid = toInt(customerId);
  const y = toInt(year);
  const m = toInt(month);
  const amt = toInt(amount);
  if (!cid || !y || !m || !amt || amt <= 0 || m < 1 || m > 12) {
    const error = new Error('year/month/amount の形式が不正です');
    error.status = 400;
    throw error;
  }
  const methodStr = ['collection', 'debit'].includes(String(method)) ? String(method) : null;
  if (!methodStr) {
    const error = new Error('method は collection または debit を指定してください');
    error.status = 400;
    throw error;
  }

  await ensureLedgerTables(db);

  await dbRun(
    db,
    `INSERT INTO ar_payments (customer_id, year, month, amount, method, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [cid, y, m, amt, methodStr, note ? String(note) : null],
  );

  return {
    customer_id: cid,
    year: y,
    month: m,
    amount: amt,
    method: methodStr,
    note: note ? String(note) : null,
  };
});

const listPayments = async (customerId, query) => withDb(async (db) => {
  const cid = toInt(customerId);
  if (!cid) {
    const error = new Error('customer_id が不正です');
    error.status = 400;
    throw error;
  }

  await ensureLedgerTables(db);

  const where = ['customer_id = ?'];
  const params = [cid];

  const y = toInt(query.year);
  if (y) {
    where.push('year = ?');
    params.push(y);
  }

  const m = toInt(query.month);
  if (m) {
    where.push('month = ?');
    params.push(m);
  }

  if (query.method && ['collection', 'debit'].includes(String(query.method))) {
    where.push('method = ?');
    params.push(String(query.method));
  }

  if (query.q && String(query.q).trim() !== '') {
    where.push('note LIKE ?');
    params.push(`%${String(query.q).trim()}%`);
  }

  const limit = Math.max(Math.min(toInt(query.limit) || 100, 500), 1);
  const offset = Math.max(toInt(query.offset) || 0, 0);

  return dbAll(
    db,
    `
      SELECT id, customer_id, year, month, amount, method, note, created_at
      FROM ar_payments
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );
});

const updatePaymentNote = async (customerId, paymentId, note) => withDb(async (db) => {
  const cid = toInt(customerId);
  const pid = toInt(paymentId);
  if (!cid || !pid) {
    const error = new Error('paymentId が不正です');
    error.status = 400;
    throw error;
  }

  await ensureLedgerTables(db);
  await dbRun(db, 'UPDATE ar_payments SET note = ? WHERE id = ? AND customer_id = ?', [note || null, pid, cid]);

  const row = await dbGet(
    db,
    'SELECT id, customer_id, year, month, amount, method, note, created_at FROM ar_payments WHERE id = ?',
    [pid],
  );
  return row || null;
});

const cancelPayment = async (customerId, paymentId) => withDb(async (db) => {
  const cid = toInt(customerId);
  const pid = toInt(paymentId);
  if (!cid || !pid) {
    const error = new Error('paymentId が不正です');
    error.status = 400;
    throw error;
  }

  await ensureLedgerTables(db);

  const original = await dbGet(
    db,
    'SELECT id, customer_id, year, month, amount, method, note FROM ar_payments WHERE id = ? AND customer_id = ?',
    [pid, cid],
  );
  if (!original) {
    const error = new Error('対象の入金が見つかりません');
    error.status = 404;
    throw error;
  }

  const cancelNote = `取消: ${original.id}${original.note ? ` (${original.note})` : ''}`;
  await dbRun(
    db,
    `INSERT INTO ar_payments (customer_id, year, month, amount, method, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [
      cid,
      original.year,
      original.month,
      -Math.abs(original.amount),
      String(original.method),
      cancelNote,
    ],
  );

  return dbGet(
    db,
    'SELECT id, customer_id, year, month, amount, method, note, created_at FROM ar_payments WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
    [cid],
  );
});

const deletePayment = async (customerId, paymentId) => withDb(async (db) => {
  const cid = toInt(customerId);
  const pid = toInt(paymentId);
  if (!cid || !pid) {
    const error = new Error('paymentId が不正です');
    error.status = 400;
    throw error;
  }

  await ensureLedgerTables(db);

  const exists = await dbGet(
    db,
    'SELECT id FROM ar_payments WHERE id = ? AND customer_id = ?',
    [pid, cid],
  );
  if (!exists) {
    const error = new Error('対象の入金が見つかりません');
    error.status = 404;
    throw error;
  }

  await dbRun(db, 'DELETE FROM ar_payments WHERE id = ? AND customer_id = ?', [pid, cid]);
  return { customer_id: cid, payment_id: pid, deleted_count: 1 };
});

module.exports = {
  registerBatchPayments,
  registerPayment,
  listPayments,
  updatePaymentNote,
  cancelPayment,
  deletePayment,
};


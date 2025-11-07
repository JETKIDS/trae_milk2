import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'milk-db-'));
process.env.MILK_DB_PATH = path.join(tempDir, 'test.db');

const { getDB } = require('../connection');
const { initializeLedgerSchema } = require('../services/customerLedgerService');
const { ensureSchema } = require('../services/customerSettingsService');
const {
  getArSummary,
  getArSummaryConsistency,
} = require('../services/customerArService');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function runCallback(err) {
    if (err) {
      reject(err);
      return;
    }
    resolve(this);
  });
});

const all = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(rows);
  });
});

beforeAll(async () => {
  await initializeLedgerSchema();
  const db = getDB();
  await run(db, 'PRAGMA foreign_keys = OFF');
  await run(db, 'CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, customer_name TEXT)');
  await ensureSchema(db);
  db.close();
});

beforeEach(async () => {
  const db = getDB();
  await run(db, 'DELETE FROM ar_invoices');
  await run(db, 'DELETE FROM ar_payments');
  await run(db, 'DELETE FROM customer_settings');
  await run(db, 'DELETE FROM customers');
  db.close();
});

afterAll(() => {
  const dbPath = process.env.MILK_DB_PATH;
  if (dbPath) {
    try {
      fs.unlinkSync(dbPath);
      fs.rmdirSync(path.dirname(dbPath));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
});

describe('customerArService', () => {
  it('computes AR summary using confirmed invoice data', async () => {
    const db = getDB();
    await run(db, 'INSERT INTO customers (id, customer_name) VALUES (1, "Test Customer")');
    await run(db, 'INSERT INTO customer_settings (customer_id, rounding_enabled) VALUES (1, 1)');
    await run(
      db,
      'INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status) VALUES (?, ?, ?, ?, ?, ?)',
      [1, 2025, 5, 1234, 1, 'confirmed'],
    );
    await run(
      db,
      'INSERT INTO ar_payments (customer_id, year, month, amount, method) VALUES (?, ?, ?, ?, ?)',
      [1, 2025, 5, 1000, 'collection'],
    );
    await run(
      db,
      'INSERT INTO ar_payments (customer_id, year, month, amount, method) VALUES (?, ?, ?, ?, ?)',
      [1, 2025, 6, 500, 'collection'],
    );
    db.close();

    const summary = await getArSummary(1, 2025, 6);
    expect(summary).toEqual({
      prev_year: 2025,
      prev_month: 5,
      prev_invoice_amount: 1234,
      prev_payment_amount: 1000,
      current_payment_amount: 500,
      carryover_amount: 734,
    });
  });

  it('falls back to computed invoice amount when confirmed invoice is missing', async () => {
    const db = getDB();
    await run(db, 'INSERT INTO customers (id, customer_name) VALUES (1, "Test Customer")');
    await run(db, 'INSERT INTO customer_settings (customer_id, rounding_enabled) VALUES (1, 1)');
    db.close();

    const summary = await getArSummary(1, 2025, 6);
    expect(summary.prev_invoice_amount).toBe(0);
    expect(summary.prev_payment_amount).toBe(0);
    expect(summary.current_payment_amount).toBe(0);
    expect(summary.carryover_amount).toBe(0);
  });

  it('provides consistency snapshot that includes expected amounts and carryover', async () => {
    const db = getDB();
    await run(db, 'INSERT INTO customers (id, customer_name) VALUES (1, "Test Customer")');
    await run(db, 'INSERT INTO customer_settings (customer_id, rounding_enabled) VALUES (1, 0)');
    await run(
      db,
      'INSERT INTO ar_payments (customer_id, year, month, amount, method) VALUES (?, ?, ?, ?, ?)',
      [1, 2025, 5, 200, 'collection'],
    );
    db.close();

    const consistency = await getArSummaryConsistency(1, 2025, 6);
    expect(consistency.prevYear).toBe(2025);
    expect(consistency.prevMonth).toBe(5);
    expect(consistency.totalRaw).toBe(0);
    expect(consistency.expectedAmount).toBe(0);
    expect(consistency.prevPaymentTotal).toBe(200);
  });

  it('throws validation error when year/month is invalid', async () => {
    await expect(getArSummary(1, 'invalid', 13)).rejects.toHaveProperty('status', 400);
  });
});

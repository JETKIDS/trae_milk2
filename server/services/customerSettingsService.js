const { dbExec, dbAll, dbGet, dbRun, withDb } = require('../utils/db');

const CUSTOMER_SETTINGS_BASE_SQL = `
  CREATE TABLE IF NOT EXISTS customer_settings (
    customer_id INTEGER PRIMARY KEY,
    billing_method TEXT CHECK (billing_method IN ('collection','debit')),
    rounding_enabled INTEGER DEFAULT 1,
    bank_code TEXT,
    branch_code TEXT,
    account_type INTEGER CHECK (account_type IN (1,2)),
    account_number TEXT,
    account_holder_katakana TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )
`;

const ensureSchema = async (db) => {
  await dbExec(db, CUSTOMER_SETTINGS_BASE_SQL);
  const columns = await dbAll(db, "PRAGMA table_info(customer_settings)");
  const columnNames = new Set(columns.map((c) => c.name));
  const alters = [];

  const ensureColumn = (name, definition) => {
    if (!columnNames.has(name)) {
      alters.push(`ALTER TABLE customer_settings ADD COLUMN ${definition}`);
    }
  };

  ensureColumn('bank_code', 'bank_code TEXT');
  ensureColumn('branch_code', 'branch_code TEXT');
  ensureColumn('account_type', 'account_type INTEGER');
  ensureColumn('account_number', 'account_number TEXT');
  ensureColumn('account_holder_katakana', 'account_holder_katakana TEXT');
  ensureColumn('updated_at', "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");

  for (const sql of alters) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await dbExec(db, sql);
    } catch (error) {
      console.error('customer_settings schema migration failed:', { sql, error });
    }
  }
};

const getCustomerSettingsByCustomerId = async (db, customerId) => {
  const row = await dbGet(
    db,
    'SELECT billing_method, rounding_enabled, bank_code, branch_code, account_type, account_number, account_holder_katakana FROM customer_settings WHERE customer_id = ?',
    [customerId],
  );
  return row || null;
};

const upsertCustomerSettingsWithDb = async (db, customerId, payload) => {
  const sql = `
    INSERT INTO customer_settings (customer_id, billing_method, rounding_enabled, bank_code, branch_code, account_type, account_number, account_holder_katakana, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(customer_id) DO UPDATE SET
      billing_method = COALESCE(excluded.billing_method, customer_settings.billing_method),
      rounding_enabled = COALESCE(excluded.rounding_enabled, customer_settings.rounding_enabled),
      bank_code = COALESCE(excluded.bank_code, customer_settings.bank_code),
      branch_code = COALESCE(excluded.branch_code, customer_settings.branch_code),
      account_type = COALESCE(excluded.account_type, customer_settings.account_type),
      account_number = COALESCE(excluded.account_number, customer_settings.account_number),
      account_holder_katakana = COALESCE(excluded.account_holder_katakana, customer_settings.account_holder_katakana),
      updated_at = CURRENT_TIMESTAMP
  `;

  await dbRun(db, sql, [
    customerId,
    payload.billing_method ?? null,
    payload.rounding_enabled ?? null,
    payload.bank_code ?? null,
    payload.branch_code ?? null,
    payload.account_type ?? null,
    payload.account_number ?? null,
    payload.account_holder_katakana ?? null,
  ]);
};

const getCustomerSettings = async (customerId) => withDb(async (db) => {
  await ensureSchema(db);
  return getCustomerSettingsByCustomerId(db, customerId);
});

const saveCustomerSettings = async (customerId, payload) => withDb(async (db) => {
  await ensureSchema(db);

  const customer = await dbGet(db, 'SELECT id FROM customers WHERE id = ?', [customerId]);
  if (!customer) {
    const error = new Error('顧客が見つかりません');
    error.status = 404;
    throw error;
  }

  await upsertCustomerSettingsWithDb(db, customerId, payload);
  return getCustomerSettingsByCustomerId(db, customerId);
});

module.exports = {
  ensureSchema,
  getCustomerSettings,
  saveCustomerSettings,
  getCustomerSettingsByCustomerId,
  upsertCustomerSettingsWithDb,
};


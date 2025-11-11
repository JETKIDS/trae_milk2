const { getDB } = require('../../connection');

function initSchema() {
  const db = getDB();
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS delivery_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      custom_id TEXT UNIQUE,
      course_name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS manufacturers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manufacturer_name TEXT NOT NULL,
      contact_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      custom_id TEXT UNIQUE,
      product_name TEXT NOT NULL,
      manufacturer_id INTEGER,
      unit_price DECIMAL(10,2) NOT NULL,
      unit TEXT DEFAULT 'ml',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      custom_id TEXT UNIQUE,
      customer_name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      course_id INTEGER,
      staff_id INTEGER,
      contract_start_date DATE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES delivery_courses(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS delivery_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      product_id INTEGER,
      delivery_days TEXT,
      quantity INTEGER DEFAULT 1,
      daily_quantities TEXT,
      unit_price DECIMAL(10,2) NOT NULL,
      start_date DATE,
      end_date DATE,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS temporary_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      change_date DATE NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('skip', 'add', 'modify')),
      product_id INTEGER,
      quantity INTEGER,
      unit_price DECIMAL(10,2),
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ar_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      rounding_enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'confirmed',
      confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(customer_id, year, month)
    )`);
  });
  db.close();
}

function resetData() {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const tables = ['operation_logs','temporary_changes','delivery_patterns','customers','products','manufacturers','delivery_courses','ar_invoices'];
    let remaining = tables.length;
    db.serialize(() => {
      tables.forEach((t) => {
        db.run(`DELETE FROM ${t}`, [], (err) => {
          if (err) {
            db.close();
            reject(err);
            return;
          }
          remaining -= 1;
          if (remaining === 0) {
            db.close();
            resolve();
          }
        });
      });
    });
  });
}

function seedBasicData() {
  return new Promise((resolve, reject) => {
    const db = getDB();
    let remaining = 4;
    db.serialize(() => {
      db.run(`INSERT OR REPLACE INTO delivery_courses (id, custom_id, course_name) VALUES (10, 'C-10', 'テストコース')`, [], done);
      db.run(`INSERT OR REPLACE INTO manufacturers (id, manufacturer_name) VALUES (1, 'テストメーカー')`, [], done);
      db.run(`INSERT OR REPLACE INTO products (id, custom_id, product_name, manufacturer_id, unit_price, unit) VALUES (1, 'P-1', 'テスト牛乳', 1, 180, '180ml')`, [], done);
      db.run(`INSERT OR REPLACE INTO customers (id, custom_id, customer_name, course_id, contract_start_date) VALUES (100, 'CU-100', 'テスト顧客', 10, '2025-01-01')`, [], done);
    });
    function done(err) {
      if (err) {
        db.close();
        reject(err);
        return;
      }
      remaining -= 1;
      if (remaining === 0) {
        db.close();
        resolve();
      }
    }
  });
}

module.exports = { initSchema, resetData, seedBasicData };
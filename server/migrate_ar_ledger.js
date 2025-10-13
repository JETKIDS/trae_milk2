const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

console.log('ARレジャー（請求・入金・残高）用テーブルのマイグレーションを開始しています...');

db.serialize(() => {
  // invoices: 月次請求書のヘッダ（総額のみ保持、明細はカレンダーから算出）
  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    base_amount INTEGER NOT NULL,        -- 税抜相当額（内税の場合は総額から逆算）
    tax_amount INTEGER NOT NULL,         -- 消費税額（内税なら r/(1+r) で算出）
    total_amount INTEGER NOT NULL,       -- 請求総額（丸め適用後）
    rounding_applied BOOLEAN DEFAULT 1,  -- 10円単位等の丸めを適用済みか
    status TEXT DEFAULT 'confirmed' CHECK(status IN ('draft','confirmed','canceled')),
    confirmed_at DATETIME,               -- 月次請求確定日時
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, year, month),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`, (err) => {
    if (err) console.error('invoices作成エラー:', err.message);
    else console.log('invoices テーブルを確認/作成しました');
  });

  // payments: 入金（集金／口座振替）
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    payment_date DATE NOT NULL,
    amount INTEGER NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('collection','debit')),
    note TEXT,
    source_ref TEXT,                     -- 口座振替CSVのファイル名等
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`, (err) => {
    if (err) console.error('payments作成エラー:', err.message);
    else console.log('payments テーブルを確認/作成しました');
  });

  // ar_ledger: 月次残高のサマリー（集計結果を保持。将来の高速表示用）
  db.run(`CREATE TABLE IF NOT EXISTS ar_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    opening_balance INTEGER NOT NULL DEFAULT 0, -- 前月繰越
    invoice_amount INTEGER NOT NULL DEFAULT 0,  -- 当月請求
    payment_amount INTEGER NOT NULL DEFAULT 0,  -- 当月入金（合計）
    carryover_amount INTEGER NOT NULL DEFAULT 0, -- 翌月繰越（= opening + invoice - payment）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, year, month),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`, (err) => {
    if (err) console.error('ar_ledger作成エラー:', err.message);
    else console.log('ar_ledger テーブルを確認/作成しました');
  });

  // インデックス
  db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_customer_period ON invoices(customer_id, year, month)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_payments_customer_date ON payments(customer_id, payment_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ledger_customer_period ON ar_ledger(customer_id, year, month)`);

  console.log('ARレジャー用テーブルのマイグレーションが完了しました');
});

db.close();
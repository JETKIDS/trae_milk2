const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

console.log('productsテーブルのマイグレーションを開始しています...');

db.serialize(() => {
  // 新しいフィールドを追加
  db.run(`ALTER TABLE products ADD COLUMN product_name_short TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('product_name_short追加エラー:', err.message);
    } else {
      console.log('product_name_short フィールドを追加しました');
    }
  });

  db.run(`ALTER TABLE products ADD COLUMN order_code TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('order_code追加エラー:', err.message);
    } else {
      console.log('order_code フィールドを追加しました');
    }
  });

  db.run(`ALTER TABLE products ADD COLUMN jan_code TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('jan_code追加エラー:', err.message);
    } else {
      console.log('jan_code フィールドを追加しました');
    }
  });

  db.run(`ALTER TABLE products ADD COLUMN sort_order INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('sort_order追加エラー:', err.message);
    } else {
      console.log('sort_order フィールドを追加しました');
    }
  });

  db.run(`ALTER TABLE products ADD COLUMN sort_type TEXT DEFAULT 'id'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('sort_type追加エラー:', err.message);
    } else {
      console.log('sort_type フィールドを追加しました');
    }
  });

  db.run(`ALTER TABLE products ADD COLUMN purchase_price DECIMAL(10,2) DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('purchase_price追加エラー:', err.message);
    } else {
      console.log('purchase_price フィールドを追加しました');
    }
  });

  db.run(`ALTER TABLE products ADD COLUMN include_in_invoice BOOLEAN DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('include_in_invoice追加エラー:', err.message);
    } else {
      console.log('include_in_invoice フィールドを追加しました');
    }
  });

  db.run(`ALTER TABLE products ADD COLUMN sales_tax_type TEXT DEFAULT 'inclusive'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('sales_tax_type追加エラー:', err.message);
    } else {
      console.log('sales_tax_type フィールドを追加しました');
    }
  });

  db.run(`ALTER TABLE products ADD COLUMN purchase_tax_type TEXT DEFAULT 'reduced'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('purchase_tax_type追加エラー:', err.message);
    } else {
      console.log('purchase_tax_type フィールドを追加しました');
    }
  });

  console.log('マイグレーション完了');
});

db.close();
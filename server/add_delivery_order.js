const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

console.log('配達順フィールドを追加しています...');

db.serialize(() => {
  // customersテーブルにdelivery_orderフィールドを追加
  db.run(`ALTER TABLE customers ADD COLUMN delivery_order INTEGER DEFAULT 0`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('delivery_orderフィールドは既に存在します。');
      } else {
        console.error('エラー:', err.message);
      }
    } else {
      console.log('delivery_orderフィールドを追加しました。');
    }
  });

  // 既存の顧客に配達順を設定（コース別に順番を付ける）
  db.run(`UPDATE customers SET delivery_order = (
    SELECT COUNT(*) + 1 
    FROM customers c2 
    WHERE c2.course_id = customers.course_id 
    AND c2.id < customers.id
  ) WHERE delivery_order = 0`, (err) => {
    if (err) {
      console.error('配達順設定エラー:', err.message);
    } else {
      console.log('既存顧客の配達順を設定しました。');
    }
  });

  console.log('配達順フィールドの追加が完了しました！');
});

db.close();
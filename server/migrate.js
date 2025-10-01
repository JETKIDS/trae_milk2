const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

console.log('データベースマイグレーションを実行しています...');

db.serialize(() => {
  // daily_quantitiesカラムが存在するかチェック
  db.all("PRAGMA table_info(delivery_patterns)", (err, rows) => {
    if (err) {
      console.error('テーブル情報の取得に失敗しました:', err);
      return;
    }
    
    const hasColumn = rows.some(row => row.name === 'daily_quantities');
    
    if (!hasColumn) {
      console.log('daily_quantitiesカラムを追加しています...');
      db.run("ALTER TABLE delivery_patterns ADD COLUMN daily_quantities TEXT", (err) => {
        if (err) {
          console.error('カラム追加に失敗しました:', err);
        } else {
          console.log('daily_quantitiesカラムが正常に追加されました。');
        }
        db.close();
      });
    } else {
      console.log('daily_quantitiesカラムは既に存在します。');
      db.close();
    }
  });
});
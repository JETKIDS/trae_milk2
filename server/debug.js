const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

console.log('データベースの内容を確認しています...');

db.serialize(() => {
  // delivery_patternsテーブルの構造を確認
  console.log('\n=== delivery_patterns テーブル構造 ===');
  db.all("PRAGMA table_info(delivery_patterns)", (err, rows) => {
    if (err) {
      console.error('テーブル情報の取得に失敗しました:', err);
      return;
    }
    console.log(rows);
    
    // delivery_patternsの全データを確認
    console.log('\n=== delivery_patterns データ ===');
    db.all("SELECT * FROM delivery_patterns", (err, rows) => {
      if (err) {
        console.error('データ取得に失敗しました:', err);
        return;
      }
      console.log('件数:', rows.length);
      rows.forEach((row, index) => {
        console.log(`\n--- パターン ${index + 1} ---`);
        console.log('ID:', row.id);
        console.log('顧客ID:', row.customer_id);
        console.log('商品ID:', row.product_id);
        console.log('配達日:', row.delivery_days);
        console.log('数量:', row.quantity);
        console.log('曜日別数量:', row.daily_quantities);
        console.log('開始日:', row.start_date);
        console.log('終了日:', row.end_date);
        console.log('アクティブ:', row.is_active);
      });
      
      db.close();
    });
  });
});
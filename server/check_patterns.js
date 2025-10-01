const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./milk_delivery.db');

console.log('配達パターンの確認:');
db.all('SELECT dp.*, c.customer_name, c.course_id FROM delivery_patterns dp JOIN customers c ON dp.customer_id = c.id WHERE c.course_id = 4 LIMIT 10', [], (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('配達パターン数:', rows.length);
    rows.forEach(row => {
      console.log(`顧客: ${row.customer_name}, 開始日: ${row.start_date}, 終了日: ${row.end_date}, アクティブ: ${row.is_active}`);
    });
  }
  db.close();
});
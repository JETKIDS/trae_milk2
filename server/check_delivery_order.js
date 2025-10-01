const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./milk_delivery.db');

db.all('SELECT id, customer_name, course_id, delivery_order FROM customers WHERE course_id IS NOT NULL ORDER BY course_id, delivery_order', [], (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('顧客の配達順序:');
    rows.forEach(row => {
      console.log(`ID: ${row.id}, 名前: ${row.customer_name}, コース: ${row.course_id}, 配達順: ${row.delivery_order}`);
    });
  }
  db.close();
});
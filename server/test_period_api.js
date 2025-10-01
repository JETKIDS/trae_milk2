const sqlite3 = require('sqlite3').verbose();
const { getDB } = require('./connection');

// 期間別配達データ取得のテスト
const testPeriodDelivery = () => {
  const db = getDB();
  const startDate = '2025-09-01';
  const endDate = '2025-09-01';
  const courseId = '4'; // コース4をテスト

  console.log('期間別配達データ取得テスト:', { startDate, endDate, courseId });

  let query = `
    SELECT 
      dp.id,
      dp.customer_id,
      dp.product_id,
      dp.delivery_days,
      dp.daily_quantities,
      c.customer_name,
      c.address,
      c.phone,
      c.course_id,
      c.delivery_order,
      dc.course_name,
      p.product_name,
      p.unit,
      dp.unit_price
    FROM delivery_patterns dp
    JOIN customers c ON dp.customer_id = c.id
    JOIN products p ON dp.product_id = p.id
    JOIN delivery_courses dc ON c.course_id = dc.id
    WHERE dp.is_active = 1
      AND date(dp.start_date) <= date(?)
      AND date(COALESCE(dp.end_date, '2099-12-31')) >= date(?)
      AND c.course_id = ?
    ORDER BY dc.course_name, c.delivery_order ASC, c.customer_name, p.product_name
  `;

  db.all(query, [startDate, endDate, courseId], (err, rows) => {
    if (err) {
      console.error('エラー:', err);
    } else {
      console.log('取得されたデータ:');
      rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.customer_name} (配達順: ${row.delivery_order})`);
      });
    }
    db.close();
  });
};

testPeriodDelivery();
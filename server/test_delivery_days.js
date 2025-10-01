const sqlite3 = require('sqlite3').verbose();
const { getDB } = require('./connection');

// 配達日判定のテスト
const testDeliveryDays = () => {
  const db = getDB();
  const testDate = '2025-10-02'; // 木曜日
  const testDateObj = new Date(testDate);
  const dayOfWeek = testDateObj.getDay(); // 4 (木曜日)
  
  console.log(`テスト日: ${testDate} (曜日: ${dayOfWeek})`);

  db.all('SELECT dp.*, c.customer_name, c.delivery_order FROM delivery_patterns dp JOIN customers c ON dp.customer_id = c.id WHERE c.course_id = 4 LIMIT 5', [], (err, rows) => {
    if (err) {
      console.error('エラー:', err);
    } else {
      console.log('配達パターンの詳細:');
      rows.forEach(row => {
        console.log(`顧客: ${row.customer_name} (配達順: ${row.delivery_order})`);
        console.log(`  配達日: ${row.delivery_days}`);
        console.log(`  日別数量: ${row.daily_quantities}`);
        
        try {
          const deliveryDays = JSON.parse(row.delivery_days || '[]');
          let quantity = 0;
          
          if (row.daily_quantities) {
            const dailyQuantities = JSON.parse(row.daily_quantities);
            quantity = dailyQuantities[dayOfWeek] || 0;
            console.log(`  木曜日の数量: ${quantity}`);
          } else {
            if (deliveryDays.includes(dayOfWeek)) {
              quantity = row.quantity || 0;
            }
            console.log(`  従来方式の数量: ${quantity}`);
          }
          
          console.log(`  最終数量: ${quantity}`);
        } catch (e) {
          console.error(`  JSON解析エラー: ${e.message}`);
        }
        console.log('---');
      });
    }
    db.close();
  });
};

testDeliveryDays();
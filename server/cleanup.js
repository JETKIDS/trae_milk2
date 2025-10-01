const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');

function cleanupDuplicates() {
  const db = new sqlite3.Database(dbPath);
  
  console.log('=== 重複パターンのクリーンアップ ===');
  
  // ID: 8を削除（ID: 9と重複しているため）
  db.run('DELETE FROM delivery_patterns WHERE id = ?', [8], function(err) {
    if (err) {
      console.error('削除エラー:', err);
    } else {
      console.log('ID: 8のパターンを削除しました');
    }
    
    // 削除後の状態を確認
    db.all('SELECT * FROM delivery_patterns WHERE customer_id = 1', (err, rows) => {
      if (err) {
        console.error('確認エラー:', err);
      } else {
        console.log('\n=== 顧客1の配達パターン（削除後） ===');
        rows.forEach(row => {
          console.log(`ID: ${row.id}, 商品ID: ${row.product_id}, 配達日: ${row.delivery_days}, 開始日: ${row.start_date}, daily_quantities: ${row.daily_quantities}`);
        });
      }
      db.close();
    });
  });
}

cleanupDuplicates();
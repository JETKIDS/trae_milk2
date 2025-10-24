const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('milk_delivery.db');

console.log('=== custom_id 3桁→4桁統一 処理開始 ===\n');

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  // custom_idがNULLでないものを4桁ゼロパディングに更新
  const sql = "UPDATE products SET custom_id = printf('%04d', CAST(custom_id AS INTEGER)) WHERE custom_id IS NOT NULL";
  db.run(sql, function(err) {
    if (err) {
      console.error('更新エラー:', err);
      return db.run('ROLLBACK', () => db.close());
    }
    console.log(`更新件数: ${this.changes}`);

    db.run('COMMIT', (err2) => {
      if (err2) {
        console.error('コミットエラー:', err2);
        return db.run('ROLLBACK', () => db.close());
      }
      console.log('\n=== 更新後一覧 ===');
      db.all("SELECT id, custom_id, product_name FROM products ORDER BY CAST(custom_id AS INTEGER)", (err3, rows) => {
        if (err3) {
          console.error('確認クエリエラー:', err3);
        } else {
          rows.forEach(r => console.log(`${r.custom_id} | ${r.id} | ${r.product_name}`));
          console.log(`\n総商品数: ${rows.length}`);
        }
        db.close();
      });
    });
  });
});
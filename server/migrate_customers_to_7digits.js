const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

console.log('顧客 custom_id を7桁へ再採番します（0000001から連番）...');

db.serialize(() => {
  db.exec('BEGIN TRANSACTION');

  db.all('SELECT id, customer_name, custom_id FROM customers ORDER BY id ASC', [], (err, rows) => {
    if (err) {
      console.error('顧客取得エラー:', err.message);
      db.exec('ROLLBACK');
      db.close();
      return;
    }

    let seq = 1;

    const updateNext = (index) => {
      if (index >= rows.length) {
        db.exec('COMMIT', (commitErr) => {
          if (commitErr) {
            console.error('コミットエラー:', commitErr.message);
          } else {
            console.log('コミット完了: 全顧客の custom_id を7桁へ再採番しました');
          }
          db.close();
        });
        return;
      }

      const row = rows[index];
      const newId = String(seq).padStart(7, '0');

      db.run('UPDATE customers SET custom_id = ? WHERE id = ?', [newId, row.id], function (updErr) {
        if (updErr) {
          console.error(`更新失敗: DB id=${row.id}, name=${row.customer_name}, custom_id=${row.custom_id} -> ${newId}`, updErr.message);
          db.exec('ROLLBACK');
          db.close();
          return;
        }
        console.log(`更新: DB id=${row.id}, name=${row.customer_name}, custom_id=${row.custom_id} -> ${newId}`);
        seq++;
        updateNext(index + 1);
      });
    };

    updateNext(0);
  });
});
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルのパス
const dbPath = path.join(__dirname, 'milk_delivery.db');

// 顧客ダミーデータ整理スクリプト
// 要件:
// 1) custom_id が 0001/0002/0003 の顧客を削除
// 2) 残った顧客の custom_id を 0001 から順番に再付与（id昇順）

function pad4(n) {
  return String(n).padStart(4, '0');
}

function runCleanup() {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('データベース接続エラー:', err.message);
      process.exit(1);
    }
    console.log('データベースに接続しました:', dbPath);
  });

  db.serialize(() => {
    db.exec('BEGIN TRANSACTION');

    // 1) 対象顧客を削除
    const deleteSql = `DELETE FROM customers WHERE custom_id IN (?, ?, ?)`;
    db.run(deleteSql, ['0001', '0002', '0003'], function (delErr) {
      if (delErr) {
        console.error('削除エラー:', delErr.message);
        db.exec('ROLLBACK');
        db.close();
        process.exit(1);
      }
      console.log(`削除対象 (0001/0002/0003): ${this.changes} 件削除`);

      // 2) 残りの顧客を取得（id昇順）
      const selectSql = `SELECT id, customer_name, custom_id FROM customers ORDER BY id ASC`;
      db.all(selectSql, (selErr, rows) => {
        if (selErr) {
          console.error('顧客取得エラー:', selErr.message);
          db.exec('ROLLBACK');
          db.close();
          process.exit(1);
        }

        console.log(`再付与対象 顧客数: ${rows.length}`);

        let index = 0;
        const updateNext = () => {
          if (index >= rows.length) {
            // すべて更新完了 -> コミット
            db.exec('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('コミットエラー:', commitErr.message);
                db.exec('ROLLBACK');
                db.close();
                process.exit(1);
              }
              console.log('コミット完了: custom_id を 0001 から再付与しました');
              db.close();
              process.exit(0);
            });
            return;
          }

          const row = rows[index];
          const newId = pad4(index + 1);
          db.run('UPDATE customers SET custom_id = ? WHERE id = ?', [newId, row.id], function (updErr) {
            if (updErr) {
              console.error(`更新エラー (id=${row.id}, name=${row.customer_name}):`, updErr.message);
              db.exec('ROLLBACK');
              db.close();
              process.exit(1);
            }
            console.log(`更新: DB id=${row.id}, name=${row.customer_name}, custom_id=${row.custom_id} -> ${newId}`);
            index++;
            updateNext();
          });
        };

        updateNext();
      });
    });
  });
}

runCleanup();
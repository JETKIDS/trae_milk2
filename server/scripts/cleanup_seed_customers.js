// ダミー顧客（初期サンプル）を安全に削除するスクリプト
// 対象: custom_id in ('0001','0002','0003') または customer_name in ('金沢 太郎','加賀 花子','能登 次郎')
// 関連テーブルも合わせて削除: customer_settings, delivery_patterns, temporary_changes, ar_invoices, ar_payments

const { getDB } = require('../connection');

const SAMPLE_CUSTOM_IDS = ['0001', '0002', '0003'];
const SAMPLE_NAMES = ['金沢 太郎', '加賀 花子', '能登 次郎'];

function run() {
  const db = getDB();
  db.serialize(() => {
    db.all(
      `SELECT id, custom_id, customer_name FROM customers 
       WHERE custom_id IN (${SAMPLE_CUSTOM_IDS.map(() => '?').join(',')})
          OR customer_name IN (${SAMPLE_NAMES.map(() => '?').join(',')})`,
      [...SAMPLE_CUSTOM_IDS, ...SAMPLE_NAMES],
      (err, rows) => {
        if (err) {
          console.error('対象顧客の取得に失敗:', err.message);
          db.close();
          process.exit(1);
        }
        if (!rows || rows.length === 0) {
          console.log('ダミー顧客は見つかりませんでした。処理を終了します。');
          db.close();
          return;
        }

        const ids = rows.map(r => r.id);
        console.log('削除対象顧客:', rows.map(r => `${r.id} (${r.custom_id}) ${r.customer_name}`).join(', '));

        const placeholders = ids.map(() => '?').join(',');

        db.run('BEGIN TRANSACTION');

        const tables = [
          'customer_settings',
          'delivery_patterns',
          'temporary_changes',
          'ar_invoices',
          'ar_payments'
        ];

        let pending = tables.length + 1; // +1 for customers table
        let hasError = false;

        tables.forEach((t) => {
          db.run(
            `DELETE FROM ${t} WHERE customer_id IN (${placeholders})`,
            ids,
            function (delErr) {
              if (delErr) {
                if (/no such table/i.test(delErr.message)) {
                  console.warn(`[WARN] テーブル ${t} が存在しません。スキップします。`);
                } else {
                  console.error(`[ERROR] テーブル ${t} の削除に失敗:`, delErr.message);
                  hasError = true;
                }
              } else {
                console.log(`[OK] ${t} から ${this.changes ?? 0} 行削除`);
              }
              if (--pending === 0) finalize();
            }
          );
        });

        // customers 自体を削除
        db.run(
          `DELETE FROM customers WHERE id IN (${placeholders})`,
          ids,
          function (delErr) {
            if (delErr) {
              console.error('[ERROR] customers の削除に失敗:', delErr.message);
              hasError = true;
            } else {
              console.log(`[OK] customers から ${this.changes ?? 0} 行削除`);
            }
            if (--pending === 0) finalize();
          }
        );

        function finalize() {
          if (hasError) {
            console.log('エラーが発生したため、ロールバックします。');
            db.run('ROLLBACK', [], (rbErr) => {
              if (rbErr) console.error('ロールバックに失敗:', rbErr.message);
              db.close();
              process.exit(1);
            });
          } else {
            db.run('COMMIT', [], (cmErr) => {
              if (cmErr) console.error('コミットに失敗:', cmErr.message);
              console.log('ダミー顧客の削除が完了しました。');
              db.close();
            });
          }
        }
      }
    );
  });
}

run();
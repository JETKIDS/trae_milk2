/**
 * 顧客名の重複検出スクリプト
 * - customers テーブルから氏名重複（カウント>1）を抽出して表示
 * 実行方法: node server/scripts/check_duplicate_names.js
 */
const { getDB } = require('../connection');

async function main() {
  const db = getDB();
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT customer_name, COUNT(*) AS cnt FROM customers GROUP BY customer_name HAVING cnt > 1 ORDER BY cnt DESC, customer_name ASC', [], (err, r) => {
        if (err) return reject(err);
        resolve(r || []);
      });
    });
    if (!rows || rows.length === 0) {
      console.log('✅ 顧客名の重複はありません');
    } else {
      console.log('❌ 顧客名の重複一覧:');
      rows.forEach(r => console.log(`  ${r.customer_name}: ${r.cnt}件`));
    }
  } catch (e) {
    console.error('検出中にエラー:', e);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
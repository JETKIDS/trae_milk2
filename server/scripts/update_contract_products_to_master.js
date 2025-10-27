const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// DB ファイルのパス
const dbPath = path.join(__dirname, '..', 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

// 旧商品名（削除対象）と、置き換え先の商品名のマッピング
// 必要に応じて調整してください。
const DEPRECATED_NAMES = [
  '生クリーム',
];
const REPLACEMENT_MAP = {
  // 旧商品名: 新商品名
  '生クリーム': '特選牛乳',
};

console.log('=== 顧客契約商品の自動更新（旧商品→現行商品）開始 ===');

function getProducts() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT p.id, p.product_name, p.include_in_invoice
       FROM products p
       ORDER BY p.product_name`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        const byName = new Map();
        const byId = new Map();
        rows.forEach((r) => {
          byName.set(r.product_name, r);
          byId.set(r.id, r);
        });
        resolve({ byName, byId, all: rows });
      }
    );
  });
}

function getPatternsReferencingDeprecated(productsById) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT dp.*
       FROM delivery_patterns dp
       JOIN products p ON dp.product_id = p.id
       WHERE p.product_name IN (${DEPRECATED_NAMES.map(() => '?').join(',')})
         AND dp.is_active = 1`,
      DEPRECATED_NAMES,
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function getTemporaryChangesReferencingDeprecated(productsById) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT tc.*
       FROM temporary_changes tc
       JOIN products p ON tc.product_id = p.id
       WHERE p.product_name IN (${DEPRECATED_NAMES.map(() => '?').join(',')})`,
      DEPRECATED_NAMES,
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function updatePatternProductId(patternId, newProductId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE delivery_patterns SET product_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [newProductId, patternId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes || 0);
      }
    );
  });
}

function updateTemporaryChangeProductId(changeId, newProductId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE temporary_changes SET product_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [newProductId, changeId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes || 0);
      }
    );
  });
}

function deleteDeprecatedProductsIfUnused() {
  return new Promise((resolve, reject) => {
    // 参照が残っていない場合のみ削除する
    const placeholders = DEPRECATED_NAMES.map(() => '?').join(',');
    const checkQuery = `
      SELECT COUNT(*) AS cnt
      FROM delivery_patterns dp
      JOIN products p ON dp.product_id = p.id
      WHERE p.product_name IN (${placeholders})
    `;
    db.get(checkQuery, DEPRECATED_NAMES, (err, row) => {
      if (err) return reject(err);
      if (row.cnt > 0) {
        console.log(`旧商品はまだ ${row.cnt} 件の契約パターンで参照されています。削除はスキップします。`);
        return resolve(0);
      }
      const checkQuery2 = `
        SELECT COUNT(*) AS cnt
        FROM temporary_changes tc
        JOIN products p ON tc.product_id = p.id
        WHERE p.product_name IN (${placeholders})
      `;
      db.get(checkQuery2, DEPRECATED_NAMES, (err2, row2) => {
        if (err2) return reject(err2);
        if (row2.cnt > 0) {
          console.log(`旧商品はまだ ${row2.cnt} 件の臨時変更で参照されています。削除はスキップします。`);
          return resolve(0);
        }
        db.run(
          `DELETE FROM products WHERE product_name IN (${placeholders})`,
          DEPRECATED_NAMES,
          function (err3) {
            if (err3) return reject(err3);
            console.log(`旧商品（${DEPRECATED_NAMES.join(', ')}）を products から削除しました。`);
            resolve(this.changes || 0);
          }
        );
      });
    });
  });
}

(async () => {
  try {
    db.exec('BEGIN TRANSACTION');

    const { byName: productsByName, byId: productsById } = await getProducts();

    // 置き換え先の存在確認
    const notFoundTargets = [];
    for (const [oldName, newName] of Object.entries(REPLACEMENT_MAP)) {
      const target = productsByName.get(newName);
      if (!target) notFoundTargets.push(`${oldName} → ${newName}`);
    }
    if (notFoundTargets.length > 0) {
      console.warn('警告: 次の置き換え先商品が products に存在しません。スクリプトは継続しますが、該当分はスキップします。');
      notFoundTargets.forEach((m) => console.warn('  - ' + m));
    }

    // 契約パターンの更新
    const deprecatedPatterns = await getPatternsReferencingDeprecated(productsById);
    let patternUpdates = 0;
    for (const pat of deprecatedPatterns) {
      // 現在の product_id に紐づく商品名を取得
      const curProd = productsById.get(pat.product_id);
      const oldName = curProd ? curProd.product_name : null;
      const replacementName = oldName ? REPLACEMENT_MAP[oldName] : null;
      const replacement = replacementName ? productsByName.get(replacementName) : null;
      if (!replacement) {
        console.log(`契約パターンID ${pat.id}: 旧商品 '${oldName}' の置き換え先が見つからずスキップ`);
        continue;
      }
      if (replacement.id === pat.product_id) {
        // 置き換え不要
        continue;
      }
      await updatePatternProductId(pat.id, replacement.id);
      patternUpdates++;
      console.log(`契約パターンID ${pat.id}: '${oldName}' → '${replacement.product_name}' に置き換え（数量/曜日は維持）`);
    }

    // 臨時変更の更新
    const deprecatedTempChanges = await getTemporaryChangesReferencingDeprecated(productsById);
    let tempUpdates = 0;
    for (const tc of deprecatedTempChanges) {
      const curProd = productsById.get(tc.product_id);
      const oldName = curProd ? curProd.product_name : null;
      const replacementName = oldName ? REPLACEMENT_MAP[oldName] : null;
      const replacement = replacementName ? productsByName.get(replacementName) : null;
      if (!replacement) {
        console.log(`臨時変更ID ${tc.id}: 旧商品 '${oldName}' の置き換え先が見つからずスキップ`);
        continue;
      }
      if (replacement.id === tc.product_id) {
        continue;
      }
      await updateTemporaryChangeProductId(tc.id, replacement.id);
      tempUpdates++;
      console.log(`臨時変更ID ${tc.id}: '${oldName}' → '${replacement.product_name}' に置き換え`);
    }

    // 旧商品の削除（参照が残っていない場合のみ）
    const deletedCount = await deleteDeprecatedProductsIfUnused();

    db.exec('COMMIT');
    console.log('\n=== 自動更新完了 ===');
    console.log(`契約パターン置き換え: ${patternUpdates} 件`);
    console.log(`臨時変更置き換え: ${tempUpdates} 件`);
    console.log(`旧商品削除: ${deletedCount} 件`);
  } catch (err) {
    console.error('エラーが発生しました。ロールバックします:', err);
    try { db.exec('ROLLBACK'); } catch (_) {}
  } finally {
    db.close();
  }
})();
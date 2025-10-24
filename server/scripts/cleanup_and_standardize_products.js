const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('milk_delivery.db');

console.log('=== 商品データのクリーンアップと標準化 ===\n');

db.serialize(() => {
  // トランザクション開始
  db.run('BEGIN TRANSACTION');

  console.log('1. 重複商品の削除...');
  
  // 重複商品を削除（新しいID側を削除）
  const duplicateIds = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26]; // メーカーID=5の重複商品
  
  duplicateIds.forEach(id => {
    db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
      if (err) {
        console.error(`商品ID ${id} の削除エラー:`, err);
      } else {
        console.log(`商品ID ${id} を削除しました`);
      }
    });
  });

  console.log('\n2. custom_idの3桁統一...');
  
  // 既存のcustom_idを3桁に変更
  const updateCustomIds = [
    { id: 1, newCustomId: '001' }, // 森永牛乳
    { id: 2, newCustomId: '002' }, // 明治おいしい牛乳
    { id: 3, newCustomId: '003' }, // 雪印メグミルク牛乳
    { id: 4, newCustomId: '004' }, // ヨーグルト
    { id: 15, newCustomId: '005' }, // ナイトチア
    { id: 16, newCustomId: '006' }  // グルコサミン
  ];

  updateCustomIds.forEach(item => {
    db.run('UPDATE products SET custom_id = ? WHERE id = ?', [item.newCustomId, item.id], function(err) {
      if (err) {
        console.error(`商品ID ${item.id} のcustom_id更新エラー:`, err);
      } else {
        console.log(`商品ID ${item.id} のcustom_idを ${item.newCustomId} に更新しました`);
      }
    });
  });

  // custom_idが無い商品に3桁のcustom_idを付与
  const assignCustomIds = [
    { id: 5, newCustomId: '007' },  // 特選牛乳
    { id: 6, newCustomId: '008' },  // プレーンヨーグルト
    { id: 7, newCustomId: '009' },  // フルーツヨーグルト
    { id: 9, newCustomId: '010' },  // モッツァレラチーズ
    { id: 10, newCustomId: '011' }, // 生クリーム
    { id: 11, newCustomId: '012' }, // バター
    { id: 12, newCustomId: '013' }, // 低脂肪牛乳
    { id: 13, newCustomId: '014' }  // カルシウム牛乳
  ];

  assignCustomIds.forEach(item => {
    db.run('UPDATE products SET custom_id = ? WHERE id = ?', [item.newCustomId, item.id], function(err) {
      if (err) {
        console.error(`商品ID ${item.id} のcustom_id設定エラー:`, err);
      } else {
        console.log(`商品ID ${item.id} にcustom_id ${item.newCustomId} を設定しました`);
      }
    });
  });

  // トランザクションコミット
  db.run('COMMIT', (err) => {
    if (err) {
      console.error('トランザクションコミットエラー:', err);
      db.run('ROLLBACK');
    } else {
      console.log('\n=== クリーンアップ完了 ===');
      
      // 結果確認
      db.all('SELECT id, custom_id, product_name, manufacturer_id FROM products ORDER BY CAST(custom_id AS INTEGER)', (err, rows) => {
        if (err) {
          console.error('結果確認エラー:', err);
        } else {
          console.log('\n更新後の商品一覧:');
          console.log('custom_id | ID | 商品名 | メーカーID');
          console.log('----------|----|---------|-----------');
          rows.forEach(row => {
            console.log(`${row.custom_id} | ${row.id} | ${row.product_name} | ${row.manufacturer_id}`);
          });
          console.log(`\n総商品数: ${rows.length}`);
        }
        db.close();
      });
    }
  });
});
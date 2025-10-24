const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('milk_delivery.db');

console.log('=== 商品データ確認 ===\n');

db.all('SELECT id, custom_id, product_name, manufacturer_id, unit_price, unit, created_at FROM products ORDER BY id', (err, rows) => {
  if (err) {
    console.error('エラー:', err);
    return;
  }

  console.log('ID | custom_id | 商品名 | メーカーID | 価格 | 単位 | 作成日');
  console.log('---|-----------|--------|------------|------|------|----------');
  
  rows.forEach(row => {
    const customId = row.custom_id || 'null';
    console.log(`${row.id} | ${customId} | ${row.product_name} | ${row.manufacturer_id} | ${row.unit_price} | ${row.unit} | ${row.created_at}`);
  });

  console.log(`\n総商品数: ${rows.length}`);
  
  // custom_idの状況を分析
  const withCustomId = rows.filter(row => row.custom_id);
  const withoutCustomId = rows.filter(row => !row.custom_id);
  
  console.log(`\ncustom_id有り: ${withCustomId.length}件`);
  console.log(`custom_id無し: ${withoutCustomId.length}件`);
  
  if (withCustomId.length > 0) {
    console.log('\ncustom_id有りの商品:');
    withCustomId.forEach(row => {
      console.log(`  ${row.custom_id}: ${row.product_name}`);
    });
  }
  
  if (withoutCustomId.length > 0) {
    console.log('\ncustom_id無しの商品:');
    withoutCustomId.forEach(row => {
      console.log(`  ID${row.id}: ${row.product_name}`);
    });
  }

  db.close();
});
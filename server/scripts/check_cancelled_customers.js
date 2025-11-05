const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../milk_delivery.db');
const db = new sqlite3.Database(dbPath);

const nov30 = '2025-11-30';
const deliveryCustomerIds = [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64];

// 11月末時点で在籍している顧客を取得
db.all(`
  SELECT c.id, c.custom_id, c.customer_name, c.contract_start_date
  FROM customers c
  WHERE c.contract_start_date <= ?
    AND NOT EXISTS (
      SELECT 1 FROM delivery_patterns dp
      WHERE dp.customer_id = c.id
        AND dp.is_active = 1
        AND dp.end_date IS NOT NULL
        AND dp.end_date < ?
    )
`, [nov30, nov30], (err, activeRows) => {
  if (err) {
    console.error('在籍顧客取得エラー:', err);
    db.close();
    return;
  }
  
  const activeIds = new Set(activeRows.map(r => r.id));
  console.log(`11月末時点で在籍している顧客: ${activeRows.length}件`);
  
  // 配達リストの顧客の詳細情報を取得
  const placeholders = deliveryCustomerIds.map(() => '?').join(',');
  db.all(`
    SELECT DISTINCT
      c.id,
      c.custom_id,
      c.customer_name,
      c.contract_start_date,
      MAX(dp.end_date) as max_end_date,
      MIN(dp.start_date) as min_start_date
    FROM customers c
    LEFT JOIN delivery_patterns dp ON c.id = dp.customer_id AND dp.is_active = 1
    WHERE c.id IN (${placeholders})
    GROUP BY c.id
    ORDER BY c.id
  `, deliveryCustomerIds, (err2, allRows) => {
    if (err2) {
      console.error('顧客情報取得エラー:', err2);
      db.close();
      return;
    }
    
    // 11月末時点で在籍していない顧客を抽出
    const notInActive = allRows.filter(r => !activeIds.has(r.id));
    
    console.log(`\n12/1〜12/10に配達がある顧客: ${allRows.length}件`);
    console.log(`11月末時点で在籍していない顧客: ${notInActive.length}件\n`);
    console.log('=== 解約/新規契約と判定される顧客例 ===\n');
    
    // 最初の10件について詳細な配達パターン情報を取得
    const targetIds = notInActive.slice(0, 10).map(r => r.id);
    const targetPlaceholders = targetIds.map(() => '?').join(',');
    
    db.all(`
      SELECT 
        dp.customer_id,
        c.customer_name,
        dp.start_date,
        dp.end_date,
        dp.is_active,
        p.product_name
      FROM delivery_patterns dp
      JOIN customers c ON dp.customer_id = c.id
      JOIN products p ON dp.product_id = p.id
      WHERE dp.customer_id IN (${targetPlaceholders})
        AND dp.is_active = 1
      ORDER BY dp.customer_id, dp.start_date
    `, targetIds, (err3, patterns) => {
      if (err3) {
        console.error('配達パターン取得エラー:', err3);
        db.close();
        return;
      }
      
      // 顧客ごとにグループ化
      const patternsByCustomer = {};
      patterns.forEach(p => {
        if (!patternsByCustomer[p.customer_id]) {
          patternsByCustomer[p.customer_id] = [];
        }
        patternsByCustomer[p.customer_id].push(p);
      });
      
      notInActive.slice(0, 10).forEach((r, index) => {
        const customerPatterns = patternsByCustomer[r.id] || [];
        const hasPatternAfterNov30 = customerPatterns.some(p => 
          !p.end_date || p.end_date >= '2025-12-01'
        );
        const hasPatternBeforeDec10 = customerPatterns.some(p => 
          p.start_date <= '2025-12-10' && (!p.end_date || p.end_date >= '2025-12-01')
        );
        
        let reason = '';
        if (r.contract_start_date > nov30) {
          reason = '12月に新規契約';
        } else if (hasPatternAfterNov30) {
          reason = `11月中に解約したが、新しい配達パターンが12/1以降に開始（終了日: ${r.max_end_date}）`;
        } else {
          reason = `11月末以前に解約（最終終了日: ${r.max_end_date}）`;
        }
        
        console.log(`${index + 1}. 顧客ID: ${r.custom_id.padStart(7, '0')}, 名前: ${r.customer_name}`);
        console.log(`   契約開始日: ${r.contract_start_date}`);
        console.log(`   判定理由: ${reason}`);
        if (customerPatterns.length > 0) {
          console.log(`   配達パターン:`);
          customerPatterns.forEach(p => {
            console.log(`     - ${p.product_name}: ${p.start_date} 〜 ${p.end_date || '無期限'} (is_active: ${p.is_active})`);
          });
        }
        console.log('');
      });
      
      if (notInActive.length > 10) {
        console.log(`... 他 ${notInActive.length - 10}件`);
      }
      
      db.close();
    });
  });
});

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルのパス
const dbPath = path.join(__dirname, 'milk_delivery.db');

// 目的:
// 「何も契約していない顧客」に対して、適当な商品を月曜(1)と木曜(4)に配達する契約を追加する。
// 判定は「delivery_patterns の is_active=1 が1件もない顧客」を対象とする。

function runAssign() {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('データベース接続エラー:', err.message);
      process.exit(1);
    }
    console.log('データベースに接続しました:', dbPath);
  });

  db.serialize(() => {
    // 適当な商品を1件取得（ID昇順）
    db.get('SELECT id, product_name, unit_price FROM products ORDER BY id ASC LIMIT 1', (perr, product) => {
      if (perr) {
        console.error('商品取得エラー:', perr.message);
        db.close();
        process.exit(1);
      }
      if (!product) {
        console.error('商品が存在しないため、契約追加を実行できません');
        db.close();
        process.exit(1);
      }

      console.log(`使用する商品: [${product.id}] ${product.product_name} (単価: ${product.unit_price})`);

      // 契約のない顧客を抽出（is_active=1 のパターンが0件）
      const query = `
        SELECT c.id, c.customer_name
        FROM customers c
        LEFT JOIN delivery_patterns dp ON dp.customer_id = c.id AND dp.is_active = 1
        GROUP BY c.id
        HAVING COUNT(dp.id) = 0
        ORDER BY c.id ASC
      `;

      db.all(query, (cerr, customers) => {
        if (cerr) {
          console.error('顧客抽出エラー:', cerr.message);
          db.close();
          process.exit(1);
        }

        if (!customers || customers.length === 0) {
          console.log('契約のない顧客は存在しません。処理を終了します。');
          db.close();
          process.exit(0);
        }

        console.log(`対象顧客数: ${customers.length} 件（契約追加を実行します）`);

        const insertStmt = db.prepare(`
          INSERT INTO delivery_patterns (customer_id, product_id, quantity, delivery_days, daily_quantities, unit_price, start_date, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, date('now'), 1, datetime('now'), datetime('now'))
        `);

        const quantity = 1; // 適当な数量を1とする
        const deliveryDays = '[1,4]'; // 月曜・木曜
        const dailyQuantities = JSON.stringify({ '1': quantity, '4': quantity });

        let processed = 0;
        customers.forEach((cust) => {
          insertStmt.run([
            cust.id,
            product.id,
            quantity,
            deliveryDays,
            dailyQuantities,
            product.unit_price,
          ], (ierr) => {
            if (ierr) {
              console.error(`契約追加エラー (customer_id=${cust.id}, ${cust.customer_name}):`, ierr.message);
              // 継続して他の顧客も処理
            } else {
              console.log(`契約追加: 顧客ID=${cust.id} 名=${cust.customer_name} -> 商品=${product.product_name} 月曜・木曜 数量=${quantity}`);
            }
            processed++;
            if (processed === customers.length) {
              insertStmt.finalize();
              console.log('全対象顧客の契約追加処理が完了しました');
              db.close();
              process.exit(0);
            }
          });
        });
      });
    });
  });
}

runAssign();
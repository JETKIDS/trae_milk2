const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// 顧客の配達パターン一覧取得
router.get('/customer/:customerId', (req, res) => {
  const { customerId } = req.params;
  const db = getDB();
  
  const query = `
    SELECT 
      dp.*,
      p.product_name,
      m.manufacturer_name,
      p.unit
    FROM delivery_patterns dp
    JOIN products p ON dp.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE dp.customer_id = ?
    ORDER BY dp.created_at DESC
  `;
  
  db.all(query, [customerId], (err, rows) => {
    if (err) {
      console.error('配達パターン取得エラー:', err);
      res.status(500).json({ error: '配達パターンの取得に失敗しました' });
    } else {
      res.json(rows);
    }
    db.close();
  });
});

// 配達パターン作成
router.post('/', (req, res) => {
  console.log('=== 配達パターン作成リクエスト ===');
  console.log('受信データ:', req.body);
  
  const {
    customer_id,
    product_id,
    quantity,
    unit_price,
    delivery_days,
    daily_quantities,
    start_date,
    end_date,
    is_active
  } = req.body;

  console.log('daily_quantities:', daily_quantities);
  console.log('delivery_days:', delivery_days);

  const db = getDB();
  const query = `
    INSERT INTO delivery_patterns (
      customer_id, product_id, quantity, unit_price, 
      delivery_days, daily_quantities, start_date, end_date, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    customer_id,
    product_id,
    quantity,
    unit_price,
    delivery_days,
    daily_quantities,
    start_date,
    end_date || null,
    is_active
  ], function(err) {
    if (err) {
      console.error('配達パターン作成エラー:', err);
      res.status(500).json({ error: '配達パターンの作成に失敗しました' });
    } else {
      res.status(201).json({ 
        id: this.lastID,
        message: '配達パターンが作成されました'
      });
    }
    db.close();
  });
});

// 配達パターン更新
router.put('/:id', (req, res) => {
  const { id } = req.params;
  console.log('=== 配達パターン更新リクエスト ===');
  console.log('受信データ:', req.body);
  
  const {
    product_id,
    quantity,
    unit_price,
    delivery_days,
    daily_quantities,
    start_date,
    end_date,
    is_active
  } = req.body;

  console.log('daily_quantities:', daily_quantities);
  console.log('delivery_days:', delivery_days);

  const db = getDB();
  const query = `
    UPDATE delivery_patterns 
    SET product_id = ?, quantity = ?, unit_price = ?, 
        delivery_days = ?, daily_quantities = ?, start_date = ?, end_date = ?, 
        is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(query, [
    product_id,
    quantity,
    unit_price,
    delivery_days,
    daily_quantities,
    start_date,
    end_date || null,
    is_active,
    id
  ], function(err) {
    if (err) {
      console.error('配達パターン更新エラー:', err);
      res.status(500).json({ error: '配達パターンの更新に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '配達パターンが見つかりません' });
    } else {
      res.json({ message: '配達パターンが更新されました' });
    }
    db.close();
  });
});

// 配達パターン削除
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDB();
  
  const query = 'DELETE FROM delivery_patterns WHERE id = ?';
  
  db.run(query, [id], function(err) {
    if (err) {
      console.error('配達パターン削除エラー:', err);
      res.status(500).json({ error: '配達パターンの削除に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '配達パターンが見つかりません' });
    } else {
      res.json({ message: '配達パターンが削除されました' });
    }
    db.close();
  });
});

// 配達パターンのアクティブ状態切り替え
router.patch('/:id/toggle', (req, res) => {
  const { id } = req.params;
  const db = getDB();
  
  const query = `
    UPDATE delivery_patterns 
    SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  db.run(query, [id], function(err) {
    if (err) {
      console.error('配達パターン状態更新エラー:', err);
      res.status(500).json({ error: '配達パターンの状態更新に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '配達パターンが見つかりません' });
    } else {
      res.json({ message: '配達パターンの状態が更新されました' });
    }
    db.close();
  });
});

module.exports = router;
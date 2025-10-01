const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// 顧客の臨時変更一覧取得
router.get('/customer/:customerId', (req, res) => {
  const { customerId } = req.params;
  const db = getDB();
  
  const query = `
    SELECT 
      tc.*,
      p.product_name,
      m.manufacturer_name,
      p.unit
    FROM temporary_changes tc
    LEFT JOIN products p ON tc.product_id = p.id
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE tc.customer_id = ?
    ORDER BY tc.change_date DESC
  `;
  
  db.all(query, [customerId], (err, rows) => {
    if (err) {
      console.error('臨時変更取得エラー:', err);
      res.status(500).json({ error: '臨時変更の取得に失敗しました' });
    } else {
      res.json(rows);
    }
    db.close();
  });
});

// 特定日の臨時変更取得
router.get('/customer/:customerId/date/:date', (req, res) => {
  const { customerId, date } = req.params;
  const db = getDB();
  
  const query = `
    SELECT 
      tc.*,
      p.product_name,
      m.manufacturer_name,
      p.unit
    FROM temporary_changes tc
    LEFT JOIN products p ON tc.product_id = p.id
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE tc.customer_id = ? AND tc.change_date = ?
    ORDER BY tc.created_at DESC
  `;
  
  db.all(query, [customerId, date], (err, rows) => {
    if (err) {
      console.error('臨時変更取得エラー:', err);
      res.status(500).json({ error: '臨時変更の取得に失敗しました' });
    } else {
      res.json(rows);
    }
    db.close();
  });
});

// 臨時変更作成
router.post('/', (req, res) => {
  const {
    customer_id,
    change_date,
    change_type,
    product_id,
    quantity,
    unit_price,
    reason
  } = req.body;

  const db = getDB();
  const query = `
    INSERT INTO temporary_changes (
      customer_id, change_date, change_type, product_id, 
      quantity, unit_price, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [
    customer_id,
    change_date,
    change_type,
    product_id || null,
    quantity || null,
    unit_price || null,
    reason || null
  ], function(err) {
    if (err) {
      console.error('臨時変更作成エラー:', err);
      res.status(500).json({ error: '臨時変更の作成に失敗しました' });
    } else {
      res.status(201).json({ 
        id: this.lastID,
        message: '臨時変更が作成されました'
      });
    }
    db.close();
  });
});

// 臨時変更更新
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const {
    change_date,
    change_type,
    product_id,
    quantity,
    unit_price,
    reason
  } = req.body;

  const db = getDB();
  const query = `
    UPDATE temporary_changes 
    SET change_date = ?, change_type = ?, product_id = ?, 
        quantity = ?, unit_price = ?, reason = ?, 
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(query, [
    change_date,
    change_type,
    product_id || null,
    quantity || null,
    unit_price || null,
    reason || null,
    id
  ], function(err) {
    if (err) {
      console.error('臨時変更更新エラー:', err);
      res.status(500).json({ error: '臨時変更の更新に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '臨時変更が見つかりません' });
    } else {
      res.json({ message: '臨時変更が更新されました' });
    }
    db.close();
  });
});

// 臨時変更削除
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDB();

  const query = 'DELETE FROM temporary_changes WHERE id = ?';
  
  db.run(query, [id], function(err) {
    if (err) {
      console.error('臨時変更削除エラー:', err);
      res.status(500).json({ error: '臨時変更の削除に失敗しました' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: '臨時変更が見つかりません' });
    } else {
      res.json({ message: '臨時変更が削除されました' });
    }
    db.close();
  });
});

// 期間内の臨時変更取得
router.get('/customer/:customerId/period/:startDate/:endDate', (req, res) => {
  const { customerId, startDate, endDate } = req.params;
  const db = getDB();
  
  const query = `
    SELECT 
      tc.*,
      p.product_name,
      m.manufacturer_name,
      p.unit
    FROM temporary_changes tc
    LEFT JOIN products p ON tc.product_id = p.id
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE tc.customer_id = ? 
      AND tc.change_date BETWEEN ? AND ?
    ORDER BY tc.change_date ASC, tc.created_at DESC
  `;
  
  db.all(query, [customerId, startDate, endDate], (err, rows) => {
    if (err) {
      console.error('臨時変更取得エラー:', err);
      res.status(500).json({ error: '臨時変更の取得に失敗しました' });
    } else {
      res.json(rows);
    }
    db.close();
  });
});

module.exports = router;
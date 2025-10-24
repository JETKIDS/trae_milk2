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
      m.id AS manufacturer_id,
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
      m.id AS manufacturer_id,
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

  // 対象年月が確定済みかチェック（確定済みなら作成を拒否）
  try {
    const y = Number(String(change_date).slice(0, 4));
    const m = Number(String(change_date).slice(5, 7));
    const checkSql = 'SELECT status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?';
    db.get(checkSql, [customer_id, y, m], (chkErr, inv) => {
      if (chkErr) {
        console.error('確定状況チェックエラー:', chkErr);
        res.status(500).json({ error: '確定状況の確認に失敗しました' });
        db.close();
        return;
      }
      if (inv && String(inv.status) === 'confirmed') {
        res.status(400).json({ error: '指定年月は確定済みのため臨時変更を登録できません。先に確定解除を行ってください。' });
        db.close();
        return;
      }
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
  } catch (e) {
    console.error('確定状況チェック処理エラー:', e);
    res.status(500).json({ error: '確定状況の確認に失敗しました' });
    db.close();
  }
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

  // 更新前後の対象年月が確定済みかチェック（確定済みなら更新を拒否）
  const selectSql = 'SELECT customer_id, change_date FROM temporary_changes WHERE id = ?';
  db.get(selectSql, [id], (selErr, row) => {
    if (selErr) {
      console.error('既存臨時変更取得エラー:', selErr);
      res.status(500).json({ error: '既存データの取得に失敗しました' });
      db.close();
      return;
    }
    if (!row) {
      res.status(404).json({ error: '臨時変更が見つかりません' });
      db.close();
      return;
    }
    const cid = row.customer_id;
    const oldY = Number(String(row.change_date).slice(0, 4));
    const oldM = Number(String(row.change_date).slice(5, 7));
    const newY = Number(String(change_date).slice(0, 4));
    const newM = Number(String(change_date).slice(5, 7));

    const checkSql = 'SELECT status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?';
    // 新しい年月の確定チェック
    db.get(checkSql, [cid, newY, newM], (chkErrNew, invNew) => {
      if (chkErrNew) {
        console.error('確定状況チェックエラー(新):', chkErrNew);
        res.status(500).json({ error: '確定状況の確認に失敗しました' });
        db.close();
        return;
      }
      if (invNew && String(invNew.status) === 'confirmed') {
        res.status(400).json({ error: '指定年月は確定済みのため臨時変更を更新できません。先に確定解除を行ってください。' });
        db.close();
        return;
      }
      // 既存（旧）年月の確定チェック
      db.get(checkSql, [cid, oldY, oldM], (chkErrOld, invOld) => {
        if (chkErrOld) {
          console.error('確定状況チェックエラー(旧):', chkErrOld);
          res.status(500).json({ error: '確定状況の確認に失敗しました' });
          db.close();
          return;
        }
        if (invOld && String(invOld.status) === 'confirmed') {
          res.status(400).json({ error: '指定年月は確定済みのため臨時変更を更新できません。先に確定解除を行ってください。' });
          db.close();
          return;
        }
        // 確定済みでない場合のみ更新を実行
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
    });
  });
});

// 臨時変更削除
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDB();

  const query = 'DELETE FROM temporary_changes WHERE id = ?';

  // 対象年月が確定済みかチェック（確定済みなら削除を拒否）
  const selectSql = 'SELECT customer_id, change_date FROM temporary_changes WHERE id = ?';
  db.get(selectSql, [id], (selErr, row) => {
    if (selErr) {
      console.error('既存臨時変更取得エラー:', selErr);
      res.status(500).json({ error: '既存データの取得に失敗しました' });
      db.close();
      return;
    }
    if (!row) {
      res.status(404).json({ error: '臨時変更が見つかりません' });
      db.close();
      return;
    }
    const y = Number(String(row.change_date).slice(0, 4));
    const m = Number(String(row.change_date).slice(5, 7));
    const checkSql = 'SELECT status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?';
    db.get(checkSql, [row.customer_id, y, m], (chkErr, inv) => {
      if (chkErr) {
        console.error('確定状況チェックエラー:', chkErr);
        res.status(500).json({ error: '確定状況の確認に失敗しました' });
        db.close();
        return;
      }
      if (inv && String(inv.status) === 'confirmed') {
        res.status(400).json({ error: '指定年月は確定済みのため臨時変更を削除できません。先に確定解除を行ってください。' });
        db.close();
        return;
      }

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
      m.id AS manufacturer_id,
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
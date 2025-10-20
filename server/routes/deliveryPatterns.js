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

  // 対象期間に確定済みの月が含まれていないかチェック
  const startKey = Number(String(start_date).slice(0, 4)) * 100 + Number(String(start_date).slice(5, 7));
  const endKey = end_date ? (Number(String(end_date).slice(0, 4)) * 100 + Number(String(end_date).slice(5, 7))) : startKey;
  const checkSql = 'SELECT year, month, status FROM ar_invoices WHERE customer_id = ? AND (year*100 + month) BETWEEN ? AND ?';

  db.all(checkSql, [customer_id, startKey, endKey], (chkErr, rows) => {
    if (chkErr) {
      console.error('確定状況の確認エラー:', chkErr);
      res.status(500).json({ error: '確定状況の確認に失敗しました' });
      db.close();
      return;
    }
    const hasConfirmed = (rows || []).some(r => String(r.status) === 'confirmed');
    if (hasConfirmed) {
      res.status(400).json({ error: '指定期間に確定済みの月が含まれるため配達パターンを作成できません。先に確定解除を行ってください。' });
      db.close();
      return;
    }

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

  // 新旧の期間に確定済みの月が含まれていないかチェック
  const selectSql = 'SELECT customer_id, start_date, end_date FROM delivery_patterns WHERE id = ?';
  db.get(selectSql, [id], (selErr, row) => {
    if (selErr) {
      console.error('既存配達パターン取得エラー:', selErr);
      res.status(500).json({ error: '既存データの取得に失敗しました' });
      db.close();
      return;
    }
    if (!row) {
      res.status(404).json({ error: '配達パターンが見つかりません' });
      db.close();
      return;
    }
    const customerId = row.customer_id;
    const newStartKey = Number(String(start_date).slice(0, 4)) * 100 + Number(String(start_date).slice(5, 7));
    const newEndKey = end_date ? (Number(String(end_date).slice(0, 4)) * 100 + Number(String(end_date).slice(5, 7))) : newStartKey;
    const oldStartKey = Number(String(row.start_date).slice(0, 4)) * 100 + Number(String(row.start_date).slice(5, 7));
    const oldEndKey = row.end_date ? (Number(String(row.end_date).slice(0, 4)) * 100 + Number(String(row.end_date).slice(5, 7))) : oldStartKey;
    const checkSql = 'SELECT year, month, status FROM ar_invoices WHERE customer_id = ? AND (year*100 + month) BETWEEN ? AND ?';

    // 新規期間の確定チェック
    db.all(checkSql, [customerId, newStartKey, newEndKey], (chkErrNew, rowsNew) => {
      if (chkErrNew) {
        console.error('確定状況の確認エラー(新):', chkErrNew);
        res.status(500).json({ error: '確定状況の確認に失敗しました' });
        db.close();
        return;
      }
      const hasConfirmedNew = (rowsNew || []).some(r => String(r.status) === 'confirmed');
      if (hasConfirmedNew) {
        res.status(400).json({ error: '指定期間に確定済みの月が含まれるため配達パターンを更新できません。先に確定解除を行ってください。' });
        db.close();
        return;
      }

      // 既存期間の確定チェック
      db.all(checkSql, [customerId, oldStartKey, oldEndKey], (chkErrOld, rowsOld) => {
        if (chkErrOld) {
          console.error('確定状況の確認エラー(旧):', chkErrOld);
          res.status(500).json({ error: '確定状況の確認に失敗しました' });
          db.close();
          return;
        }
        const hasConfirmedOld = (rowsOld || []).some(r => String(r.status) === 'confirmed');
        if (hasConfirmedOld) {
          res.status(400).json({ error: '指定期間に確定済みの月が含まれるため配達パターンを更新できません。先に確定解除を行ってください。' });
          db.close();
          return;
        }

        // 確定済みがない場合のみ更新
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
    });
  });
});

// 配達パターン削除
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDB();
  
  const query = 'DELETE FROM delivery_patterns WHERE id = ?';

  // 対象期間に確定済みの月が含まれていないかチェック（含まれる場合は削除不可）
  const selectSql = 'SELECT customer_id, start_date, end_date FROM delivery_patterns WHERE id = ?';
  db.get(selectSql, [id], (selErr, row) => {
    if (selErr) {
      console.error('既存配達パターン取得エラー:', selErr);
      res.status(500).json({ error: '既存データの取得に失敗しました' });
      db.close();
      return;
    }
    if (!row) {
      res.status(404).json({ error: '配達パターンが見つかりません' });
      db.close();
      return;
    }
    const startKey = Number(String(row.start_date).slice(0, 4)) * 100 + Number(String(row.start_date).slice(5, 7));
    const endKey = row.end_date ? (Number(String(row.end_date).slice(0, 4)) * 100 + Number(String(row.end_date).slice(5, 7))) : startKey;
    const checkSql = 'SELECT year, month, status FROM ar_invoices WHERE customer_id = ? AND (year*100 + month) BETWEEN ? AND ?';

    db.all(checkSql, [row.customer_id, startKey, endKey], (chkErr, rows) => {
      if (chkErr) {
        console.error('確定状況の確認エラー:', chkErr);
        res.status(500).json({ error: '確定状況の確認に失敗しました' });
        db.close();
        return;
      }
      const hasConfirmed = (rows || []).some(r => String(r.status) === 'confirmed');
      if (hasConfirmed) {
        res.status(400).json({ error: '対象期間に確定済みの月が含まれるため配達パターンを削除できません。先に確定解除を行ってください。' });
        db.close();
        return;
      }

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

  // 対象期間に確定済みの月が含まれていないかチェック（含まれる場合は切替不可）
  const selectSql = 'SELECT customer_id, start_date, end_date FROM delivery_patterns WHERE id = ?';
  db.get(selectSql, [id], (selErr, row) => {
    if (selErr) {
      console.error('既存配達パターン取得エラー:', selErr);
      res.status(500).json({ error: '既存データの取得に失敗しました' });
      db.close();
      return;
    }
    if (!row) {
      res.status(404).json({ error: '配達パターンが見つかりません' });
      db.close();
      return;
    }
    const startKey = Number(String(row.start_date).slice(0, 4)) * 100 + Number(String(row.start_date).slice(5, 7));
    const endKey = row.end_date ? (Number(String(row.end_date).slice(0, 4)) * 100 + Number(String(row.end_date).slice(5, 7))) : startKey;
    const checkSql = 'SELECT year, month, status FROM ar_invoices WHERE customer_id = ? AND (year*100 + month) BETWEEN ? AND ?';

    db.all(checkSql, [row.customer_id, startKey, endKey], (chkErr, rows) => {
      if (chkErr) {
        console.error('確定状況の確認エラー:', chkErr);
        res.status(500).json({ error: '確定状況の確認に失敗しました' });
        db.close();
        return;
      }
      const hasConfirmed = (rows || []).some(r => String(r.status) === 'confirmed');
      if (hasConfirmed) {
        res.status(400).json({ error: '対象期間に確定済みの月が含まれるため配達パターンの状態を切り替えできません。先に確定解除を行ってください。' });
        db.close();
        return;
      }

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
  });
});

module.exports = router;
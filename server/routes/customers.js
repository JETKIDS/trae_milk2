const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');
const moment = require('moment');

// 顧客一覧取得（複数検索条件対応）
router.get('/', (req, res) => {
  const db = getDB();
  const { searchId, searchName, searchAddress, searchPhone, sort } = req.query;
  
  let query = `
    SELECT c.*, dc.course_name, ds.staff_name 
    FROM customers c
    LEFT JOIN delivery_courses dc ON c.course_id = dc.id
    LEFT JOIN delivery_staff ds ON c.staff_id = ds.id
  `;
  
  let whereConditions = [];
  let params = [];
  
  // IDで検索
  if (searchId && searchId.trim() !== '') {
    const idTerm = searchId.trim();
    const isNumeric = /^\d+$/.test(idTerm);
    if (isNumeric) {
      const paddedId = idTerm.padStart(4, '0');
      whereConditions.push('c.custom_id = ?');
      params.push(paddedId);
    } else {
      whereConditions.push('c.custom_id LIKE ?');
      params.push(`%${idTerm}%`);
    }
  }
  
  // 名前で検索
  if (searchName && searchName.trim() !== '') {
    const nameTerm = searchName.trim();
    // 顧客名は「よみがな（ひらがな）」でも検索可能にする
    // 先頭一致（prefix）で検索：入力値で始まる顧客のみ抽出
    // 例）"いと" → "いとう" はヒット、"さいとう" は非ヒット
    whereConditions.push('(c.customer_name LIKE ? OR c.yomi LIKE ?)');
    params.push(`${nameTerm}%`, `${nameTerm}%`);
  }
  
  // 住所で検索
  if (searchAddress && searchAddress.trim() !== '') {
    whereConditions.push('c.address LIKE ?');
    params.push(`%${searchAddress.trim()}%`);
  }
  
  // 電話番号で検索
  if (searchPhone && searchPhone.trim() !== '') {
    whereConditions.push('c.phone LIKE ?');
    params.push(`%${searchPhone.trim()}%`);
  }
  
  // WHERE条件を結合
  if (whereConditions.length > 0) {
    query += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  // 並び順の選択（id / yomi / course）。デフォルトは yomi
  const sortKey = (sort || 'yomi').toLowerCase();
  if (sortKey === 'id') {
    // custom_id（4桁ゼロパディング前提）で昇順
    query += ` ORDER BY c.custom_id ASC`;
  } else if (sortKey === 'course') {
    // コース名で昇順、同一コース内は「配達順（delivery_order）」を優先し、その後 yomi/名前
    // ユーザー要望: コース順選択時はコース内の順位（配達順）を参照
    query += ` ORDER BY dc.course_name ASC, c.delivery_order ASC, CASE WHEN c.yomi IS NOT NULL AND c.yomi <> '' THEN c.yomi ELSE c.customer_name END ASC`;
  } else {
    // yomi（または名前）で昇順
    query += ` ORDER BY CASE WHEN c.yomi IS NOT NULL AND c.yomi <> '' THEN c.yomi ELSE c.customer_name END ASC`;
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
  
  db.close();
});

// ページング版 顧客一覧取得（items + total 返却）
router.get('/paged', (req, res) => {
  const db = getDB();
  const { searchId, searchName, searchAddress, searchPhone, sort, page = '1', pageSize = '50' } = req.query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);
  const offset = (pageNum - 1) * sizeNum;

  let whereConditions = [];
  let params = [];

  // IDで検索
  if (searchId && String(searchId).trim() !== '') {
    const idTerm = String(searchId).trim();
    const isNumeric = /^\d+$/.test(idTerm);
    if (isNumeric) {
      const paddedId = idTerm.padStart(4, '0');
      whereConditions.push('c.custom_id = ?');
      params.push(paddedId);
    } else {
      whereConditions.push('c.custom_id LIKE ?');
      params.push(`%${idTerm}%`);
    }
  }

  // 名前で検索（よみがな先頭一致も）
  if (searchName && String(searchName).trim() !== '') {
    const nameTerm = String(searchName).trim();
    whereConditions.push('(c.customer_name LIKE ? OR c.yomi LIKE ?)');
    params.push(`${nameTerm}%`, `${nameTerm}%`);
  }

  // 住所で検索
  if (searchAddress && String(searchAddress).trim() !== '') {
    whereConditions.push('c.address LIKE ?');
    params.push(`%${String(searchAddress).trim()}%`);
  }

  // 電話番号で検索
  if (searchPhone && String(searchPhone).trim() !== '') {
    whereConditions.push('c.phone LIKE ?');
    params.push(`%${String(searchPhone).trim()}%`);
  }

  // 件数カウント用クエリ（JOIN不要）
  let countQuery = `SELECT COUNT(*) AS total FROM customers c`;
  if (whereConditions.length > 0) {
    countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  // データ取得用クエリ
  let dataQuery = `
    SELECT c.*, dc.course_name, ds.staff_name 
    FROM customers c
    LEFT JOIN delivery_courses dc ON c.course_id = dc.id
    LEFT JOIN delivery_staff ds ON c.staff_id = ds.id
  `;

  if (whereConditions.length > 0) {
    dataQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  const sortKey = (String(sort || 'yomi')).toLowerCase();
  if (sortKey === 'id') {
    dataQuery += ` ORDER BY c.custom_id ASC`;
  } else if (sortKey === 'course') {
    dataQuery += ` ORDER BY dc.course_name ASC, c.delivery_order ASC, CASE WHEN c.yomi IS NOT NULL AND c.yomi <> '' THEN c.yomi ELSE c.customer_name END ASC`;
  } else {
    dataQuery += ` ORDER BY CASE WHEN c.yomi IS NOT NULL AND c.yomi <> '' THEN c.yomi ELSE c.customer_name END ASC`;
  }

  dataQuery += ` LIMIT ? OFFSET ?`;
  const dataParams = [...params, sizeNum, offset];

  db.get(countQuery, params, (countErr, countRow) => {
    if (countErr) {
      res.status(500).json({ error: countErr.message });
      db.close();
      return;
    }
    const total = countRow?.total || 0;

    db.all(dataQuery, dataParams, (dataErr, rows) => {
      if (dataErr) {
        res.status(500).json({ error: dataErr.message });
        db.close();
        return;
      }
      res.json({ items: rows, total });
      db.close();
    });
  });
});

// 次の顧客ID（未使用の最小4桁ID）を返す - 動的ルートより前に定義
router.get('/next-id', (req, res) => {
  const db = getDB();
  const query = `SELECT custom_id FROM customers WHERE LENGTH(custom_id) = 4 AND custom_id GLOB '[0-9][0-9][0-9][0-9]'`;
  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    const used = new Set(rows.map(r => parseInt(r.custom_id, 10)).filter(n => !isNaN(n)));
    let candidate = 1;
    while (candidate <= 9999 && used.has(candidate)) candidate++;
    const nextId = candidate <= 9999 ? candidate.toString().padStart(4, '0') : null;
    res.json({ custom_id: nextId });
    db.close();
  });
});

// 特定顧客の詳細情報と配達パターン取得
router.get('/:id', (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  
  // 顧客基本情報
  const customerQuery = `
    SELECT c.*, dc.course_name, ds.staff_name 
    FROM customers c
    LEFT JOIN delivery_courses dc ON c.course_id = dc.id
    LEFT JOIN delivery_staff ds ON c.staff_id = ds.id
    WHERE c.id = ?
  `;
  
  // 配達パターン
  const patternsQuery = `
    SELECT dp.*, p.product_name, p.unit_price, p.unit, m.manufacturer_name
    FROM delivery_patterns dp
    JOIN products p ON dp.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE dp.customer_id = ? AND dp.is_active = 1
  `;
  
  db.get(customerQuery, [customerId], (err, customer) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!customer) {
      res.status(404).json({ error: '顧客が見つかりません' });
      return;
    }
    
    db.all(patternsQuery, [customerId], (err, patterns) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({
        customer,
        patterns
      });
    });
  });
  
  db.close();
});

// 顧客登録
router.post('/', (req, res) => {
  const db = getDB();
  const { custom_id, customer_name, yomi, address, phone, email, course_id, staff_id, contract_start_date, notes, delivery_order } = req.body;
  
  // custom_idが指定されていない場合は自動生成（4桁形式）
  const generateCustomId = (callback) => {
    // 既存の4桁数値IDを取得し、未使用の最小値を返す
    const allIdQuery = `SELECT custom_id FROM customers WHERE LENGTH(custom_id) = 4 AND custom_id GLOB '[0-9][0-9][0-9][0-9]'`;
    db.all(allIdQuery, [], (err, rows) => {
      if (err) {
        callback(err, null);
        return;
      }
      const used = new Set(rows.map(r => parseInt(r.custom_id, 10)).filter(n => !isNaN(n)));
      let candidate = 1;
      while (candidate <= 9999 && used.has(candidate)) candidate++;
      const newCustomId = candidate <= 9999 ? candidate.toString().padStart(4, '0') : null;
      callback(null, newCustomId);
    });
  };
  
  const insertCustomer = (finalCustomId) => {
    // delivery_orderが指定されていない場合は、そのコースの最大値+1を設定
    const getMaxDeliveryOrder = (callback) => {
      if (delivery_order !== undefined && delivery_order !== null) {
        callback(null, delivery_order);
        return;
      }
      
      const maxOrderQuery = `SELECT MAX(delivery_order) as max_order FROM customers WHERE course_id = ?`;
      db.get(maxOrderQuery, [course_id], (err, result) => {
        if (err) {
          callback(err, null);
          return;
        }
        const nextOrder = result && result.max_order !== null ? result.max_order + 1 : 1;
        callback(null, nextOrder);
      });
    };
    
    getMaxDeliveryOrder((err, finalDeliveryOrder) => {
      if (err) {
        res.status(500).json({ error: err.message });
        db.close();
        return;
      }
      
      const query = `
        INSERT INTO customers (custom_id, customer_name, yomi, address, phone, email, course_id, staff_id, contract_start_date, notes, delivery_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [finalCustomId, customer_name, yomi || null, address, phone, email, course_id, staff_id, contract_start_date, notes, finalDeliveryOrder], function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              res.status(400).json({ error: 'このIDは既に使用されています' });
            } else {
              res.status(500).json({ error: err.message });
            }
            db.close();
            return;
          }
          res.json({ id: this.lastID, custom_id: finalCustomId, message: '顧客が正常に登録されました' });
          db.close();
        });
      });
    };
  
  if (custom_id) {
    insertCustomer(custom_id);
  } else {
    generateCustomId((err, newCustomId) => {
      if (err) {
        res.status(500).json({ error: err.message });
        db.close();
        return;
      }
      insertCustomer(newCustomId);
    });
  }
});

 

// 顧客コース移動（具体的なルートを先に配置）
router.put('/move-course', (req, res) => {
  console.log('🚀 顧客コース移動API呼び出し受信');
  console.log('📥 リクエストボディ:', req.body);
  
  const db = getDB();
  const { customerIds, newCourseId } = req.body;

  if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
    console.log('❌ 顧客IDが無効:', customerIds);
    return res.status(400).json({ error: '移動する顧客IDが指定されていません' });
  }

  if (!newCourseId) {
    console.log('❌ 移動先コースIDが無効:', newCourseId);
    return res.status(400).json({ error: '移動先のコースIDが指定されていません' });
  }

  console.log('✅ バリデーション通過:', { customerIds, newCourseId });

  try {
    // トランザクション開始
    db.exec('BEGIN TRANSACTION');

    // 移動先コースが存在するかチェック
    db.get('SELECT id FROM delivery_courses WHERE id = ?', [newCourseId], (err, courseCheck) => {
      if (err) {
        db.exec('ROLLBACK');
        console.error('❌ コースチェックエラー:', err);
        return res.status(500).json({ error: 'コースの確認に失敗しました' });
      }
      
      if (!courseCheck) {
        db.exec('ROLLBACK');
        return res.status(400).json({ error: '指定された移動先コースが存在しません' });
      }

      // 各顧客のコースを更新
      let processedCount = 0;
      const totalCustomers = customerIds.length;
      
      for (const customerId of customerIds) {
        // 顧客が存在するかチェック
        db.get('SELECT id FROM customers WHERE id = ?', [customerId], (customerErr, customerCheck) => {
          if (customerErr) {
            db.exec('ROLLBACK');
            console.error('❌ 顧客チェックエラー:', customerErr);
            return res.status(500).json({ error: '顧客の確認に失敗しました' });
          }
          
          if (!customerCheck) {
            db.exec('ROLLBACK');
            return res.status(400).json({ error: `顧客ID ${customerId} が存在しません` });
          }
          
          // コースを更新
          db.run('UPDATE customers SET course_id = ? WHERE id = ?', [newCourseId, customerId], (updateErr) => {
            if (updateErr) {
              db.exec('ROLLBACK');
              console.error('❌ 顧客更新エラー:', updateErr);
              return res.status(500).json({ error: '顧客のコース更新に失敗しました' });
            }
            
            processedCount++;
            
            // 全ての顧客の処理が完了したら配達順を更新
            if (processedCount === totalCustomers) {
              updateDeliveryOrder();
            }
          });
        });
      }
      
      function updateDeliveryOrder() {

    // 移動先コースの配達順を再設定（新しく追加された顧客を最後に配置）
    db.all(`
      SELECT id FROM customers 
      WHERE course_id = ? 
      ORDER BY delivery_order ASC, id ASC
    `, [newCourseId], (err, customersInNewCourse) => {
      if (err) {
        db.exec('ROLLBACK');
        console.error('❌ 顧客取得エラー:', err);
        return res.status(500).json({ error: '顧客データの取得に失敗しました' });
      }

      if (customersInNewCourse && customersInNewCourse.length > 0) {
        customersInNewCourse.forEach((customer, index) => {
          db.run('UPDATE customers SET delivery_order = ? WHERE id = ?', [index + 1, customer.id], (updateErr) => {
            if (updateErr) {
              console.error('❌ 配達順更新エラー:', updateErr);
            }
          });
        });
      }

        db.exec('COMMIT');
        console.log('✅ トランザクション完了');

        const result = { 
          message: `${customerIds.length}名の顧客のコース移動が完了しました`,
          movedCustomers: customerIds.length
        };
        console.log('📤 レスポンス送信:', result);
        res.json(result);
      });
      }
    });

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ 顧客コース移動エラー:', error);
    res.status(500).json({ error: '顧客のコース移動に失敗しました' });
  }
});

// 顧客情報更新（汎用的なルートを後に配置）
router.put('/:id', (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { custom_id, customer_name, yomi, address, phone, email, course_id, staff_id, contract_start_date, notes, delivery_order } = req.body;
  
  const query = `
    UPDATE customers 
    SET custom_id = ?, customer_name = ?, yomi = ?, address = ?, phone = ?, email = ?, course_id = ?, staff_id = ?, contract_start_date = ?, notes = ?, delivery_order = ?
    WHERE id = ?
  `;
  
  db.run(query, [custom_id, customer_name, yomi || null, address, phone, email, course_id, staff_id, contract_start_date, notes, delivery_order, customerId], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'このIDは既に使用されています' });
      } else {
        res.status(500).json({ error: err.message });
      }
      return;
    }
    res.json({ message: '顧客情報が正常に更新されました' });
  });
  
  db.close();
});

// コース別顧客一覧取得
router.get('/by-course/:courseId', (req, res) => {
  const db = getDB();
  const courseId = req.params.courseId;
  
  const query = `
    SELECT c.*, dc.course_name, ds.staff_name
    FROM customers c
    LEFT JOIN delivery_courses dc ON c.course_id = dc.id
    LEFT JOIN delivery_staff ds ON c.staff_id = ds.id
    WHERE c.course_id = ?
    ORDER BY c.delivery_order ASC, c.id ASC
  `;
  
  db.all(query, [courseId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
  
  db.close();
});

// 配達順一括更新
router.put('/delivery-order/bulk', (req, res) => {
  const db = getDB();
  const { updates } = req.body; // [{ id, delivery_order }, ...]
  
  if (!updates || !Array.isArray(updates)) {
    res.status(400).json({ error: '更新データが無効です' });
    return;
  }
  
  // トランザクション開始
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    let completed = 0;
    let hasError = false;
    
    updates.forEach((update, index) => {
      const { id, delivery_order } = update;
      
      db.run(
        'UPDATE customers SET delivery_order = ? WHERE id = ?',
        [delivery_order, id],
        function(err) {
          if (err && !hasError) {
            hasError = true;
            db.run('ROLLBACK');
            res.status(500).json({ error: err.message });
            return;
          }
          
          completed++;
          if (completed === updates.length && !hasError) {
            db.run('COMMIT');
            res.json({ message: '配達順が正常に更新されました' });
          }
        }
      );
    });
  });
});

// 月次配達カレンダー生成
router.get('/:id/calendar/:year/:month', (req, res) => {
  const db = getDB();
  const { id, year, month } = req.params;
  
  // 指定月の配達パターンを取得
  const patternsQuery = `
    SELECT dp.*, p.product_name, p.unit_price, p.unit, m.manufacturer_name
    FROM delivery_patterns dp
    JOIN products p ON dp.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE dp.customer_id = ? AND dp.is_active = 1
  `;
  
  // 指定月の臨時配達を取得（当月のみ）
  const temporaryQuery = `
    SELECT tc.*, p.product_name, p.unit_price, p.unit, m.manufacturer_name
    FROM temporary_changes tc
    JOIN products p ON tc.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE tc.customer_id = ? 
      AND tc.change_type = 'add'
      AND strftime('%Y', tc.change_date) = ?
      AND strftime('%m', tc.change_date) = ?
  `;
  
  db.all(patternsQuery, [id], (err, patterns) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    db.all(temporaryQuery, [id, year, month.toString().padStart(2, '0')], (err, temporaryChanges) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // カレンダーデータ生成
      const calendar = generateMonthlyCalendar(year, month, patterns, temporaryChanges);
      res.json({
        calendar: calendar,
        temporaryChanges: temporaryChanges
      });
    });
  });
  
  db.close();
});

// カレンダー生成ヘルパー関数
function generateMonthlyCalendar(year, month, patterns, temporaryChanges = []) {
  const startDate = moment(`${year}-${month.toString().padStart(2, '0')}-01`);
  const endDate = startDate.clone().endOf('month');
  const calendar = [];
  
  for (let date = startDate.clone(); date.isSameOrBefore(endDate); date.add(1, 'day')) {
    const dayOfWeek = date.day(); // 0=日曜日, 1=月曜日, ...
    const currentDateStr = date.format('YYYY-MM-DD');
    const dayData = {
      date: currentDateStr,
      day: date.date(),
      dayOfWeek,
      products: []
    };
    
    // 定期配達パターンの処理
    patterns.forEach(pattern => {
      // 開始日チェック
      if (pattern.start_date && moment(currentDateStr).isBefore(moment(pattern.start_date))) {
        return; // 開始日前はスキップ
      }
      
      // 終了日チェック
      if (pattern.end_date && moment(currentDateStr).isAfter(moment(pattern.end_date))) {
        return; // 終了日後はスキップ
      }
      
      let quantity = 0;
      
      // daily_quantitiesがある場合はそれを使用
      if (pattern.daily_quantities) {
        try {
          const dailyQuantities = JSON.parse(pattern.daily_quantities);
          quantity = dailyQuantities[dayOfWeek] || 0;
        } catch (e) {
          console.error('daily_quantitiesのパースに失敗:', e);
          quantity = 0;
        }
      } else {
        // 従来の方式（後方互換性）
        const deliveryDays = JSON.parse(pattern.delivery_days || '[]');
        if (deliveryDays.includes(dayOfWeek)) {
          quantity = pattern.quantity || 0;
        }
      }
      
      if (quantity > 0) {
        dayData.products.push({
          productName: pattern.product_name,
          quantity: quantity,
          unitPrice: pattern.unit_price,
          unit: pattern.unit,
          amount: quantity * pattern.unit_price
        });
      }
    });
    
    // 臨時配達の処理（当月のみ）
    temporaryChanges.forEach(tempChange => {
      if (tempChange.change_date === currentDateStr && tempChange.quantity > 0) {
        dayData.products.push({
          productName: `（臨時）${tempChange.product_name}`,
          quantity: tempChange.quantity,
          unitPrice: tempChange.unit_price,
          unit: tempChange.unit,
          amount: tempChange.quantity * tempChange.unit_price
        });
      }
    });
    
    calendar.push(dayData);
  }
  
  return calendar;
}



module.exports = router;
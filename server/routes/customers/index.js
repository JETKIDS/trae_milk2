const express = require('express');
const router = express.Router();
const { getDB } = require('../../connection');
const { dbAll } = require('../../utils/db');
const {
  fetchCustomers,
  fetchCustomersPaged,
  fetchNextCustomerId,
  fetchCustomerDetail,
} = require('../../services/customerService');
const { saveCustomerSettings } = require('../../services/customerSettingsService');
const {
  confirmInvoice,
  confirmInvoicesBatch,
  unconfirmInvoice,
  unconfirmInvoicesBatch,
  getInvoiceStatus,
  getCourseInvoiceAmounts,
  getCourseInvoiceStatuses,
  getCoursePaymentsSum,
} = require('../../services/customerLedgerService');
const {
  registerBatchPayments,
  registerPayment,
  listPayments,
  updatePaymentNote,
  cancelPayment,
  deletePayment,
} = require('../../services/customerPaymentService');
const {
  bulkUpdateDeliveryOrder,
  updateDeliveryOrderForCourse,
} = require('../../services/customerDeliveryService');
const {
  getCustomerCalendar,
  getCourseCalendars,
} = require('../../services/customerCalendarService');
const {
  getArSummary,
  getArSummaryConsistency,
} = require('../../services/customerArService');

// 顧客一覧取得（複数検索条件対応）
router.get('/', async (req, res) => {
  try {
    const customers = await fetchCustomers(req.query);
    res.json(customers);
  } catch (error) {
    console.error('顧客一覧取得エラー:', error);
    res.status(500).json({ error: error.message || '顧客一覧の取得に失敗しました' });
  }
});

// 顧客の請求設定（請求方法・端数処理）を保存
router.put('/:id/settings', async (req, res) => {
  const customerId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(customerId)) {
    res.status(400).json({ error: '顧客IDが不正です' });
    return;
  }

  const {
    billing_method,
    rounding_enabled,
    bank_code,
    branch_code,
    account_type,
    account_number,
    account_holder_katakana,
  } = req.body ?? {};

  const method = billing_method === 'debit' || billing_method === 'collection' ? billing_method : null;
  const rounding = typeof rounding_enabled === 'number'
    ? rounding_enabled
    : typeof rounding_enabled === 'boolean'
      ? (rounding_enabled ? 1 : 0)
      : null;

  const digit4 = (s) => typeof s === 'string' && /^\d{4}$/.test(s);
  const digit3 = (s) => typeof s === 'string' && /^\d{3}$/.test(s);
  const digit7 = (s) => typeof s === 'string' && /^\d{7}$/.test(s);
  const typeValid = (t) => t === 1 || t === 2 || t === null || t === undefined;
  const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/;
  const toNullableString = (value) => {
    if (value === undefined || value === null) {
      return null;
    }
    const str = String(value);
    return str === '' ? null : str;
  };

  if (bank_code !== undefined && bank_code !== null && bank_code !== '' && !digit4(String(bank_code))) {
    res.status(400).json({ error: '金融機関コードは4桁の数字で入力してください' });
    return;
  }
  if (branch_code !== undefined && branch_code !== null && branch_code !== '' && !digit3(String(branch_code))) {
    res.status(400).json({ error: '支店コードは3桁の数字で入力してください' });
    return;
  }
  if (account_number !== undefined && account_number !== null && account_number !== '' && !digit7(String(account_number))) {
    res.status(400).json({ error: '口座番号は7桁の数字で入力してください' });
    return;
  }

  const normalizedAccountType = account_type === undefined || account_type === null || account_type === ''
    ? null
    : Number.parseInt(account_type, 10);
  if (!typeValid(normalizedAccountType)) {
    res.status(400).json({ error: '預金種別は 1（普通）または 2（当座）で入力してください' });
    return;
  }

  if (account_holder_katakana !== undefined && account_holder_katakana !== null) {
    const value = String(account_holder_katakana);
    if (value.length === 0 || !halfKanaRegex.test(value)) {
      res.status(400).json({ error: '口座名義は半角カタカナで入力してください（スペース可）' });
      return;
    }
  }

  try {
    const saved = await saveCustomerSettings(customerId, {
      billing_method: method,
      rounding_enabled: rounding,
      bank_code: toNullableString(bank_code),
      branch_code: toNullableString(branch_code),
      account_type: normalizedAccountType,
      account_number: toNullableString(account_number),
      account_holder_katakana: toNullableString(account_holder_katakana),
    });

    res.json({
      message: '設定を保存しました',
      customer_id: customerId,
      billing_method: saved?.billing_method ?? method,
      rounding_enabled: saved?.rounding_enabled ?? rounding,
    });
  } catch (error) {
    if (error && error.status === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('顧客設定保存エラー:', error);
    res.status(500).json({ error: error.message || '顧客設定の保存に失敗しました' });
  }
});

// ページング版 顧客一覧取得（items + total 返却）
router.get('/paged', async (req, res) => {
  try {
    const { items, total } = await fetchCustomersPaged(req.query);
    res.json({ items, total });
  } catch (error) {
    console.error('顧客一覧（ページング）取得エラー:', error);
    res.status(500).json({ error: error.message || '顧客一覧の取得に失敗しました' });
  }
});

// 次の顧客ID（未使用の最小7桁ID）を返す - 動的ルートより前に定義
router.get('/next-id', async (_req, res) => {
  try {
    const customId = await fetchNextCustomerId();
    res.json({ custom_id: customId });
  } catch (error) {
    console.error('次の顧客ID取得エラー:', error);
    res.status(500).json({ error: error.message || '顧客IDの取得に失敗しました' });
  }
});

// 特定顧客の詳細情報と配達パターン取得
router.get('/:id', async (req, res) => {
  const customerId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(customerId)) {
    res.status(400).json({ error: '顧客IDが不正です' });
    return;
  }

  try {
    const detail = await fetchCustomerDetail(customerId);
    res.json(detail);
  } catch (error) {
    if (error && error.status === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('顧客詳細取得エラー:', error);
    res.status(500).json({ error: error.message || '顧客詳細の取得に失敗しました' });
  }
});

// 顧客登録
router.post('/', (req, res) => {
  const db = getDB();
  const { custom_id, customer_name, yomi, address, phone, email, course_id, staff_id, contract_start_date, notes, delivery_order } = req.body;
  
  // custom_idが指定されていない場合は自動生成（7桁形式）
  const generateCustomId = (callback) => {
    // 既存の7桁数値IDを取得し、未使用の最小値を返す
    const allIdQuery = `SELECT custom_id FROM customers WHERE LENGTH(custom_id) = 7 AND custom_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'`;
    db.all(allIdQuery, [], (err, rows) => {
      if (err) {
        callback(err, null);
        return;
      }
      const used = new Set(rows.map(r => parseInt(r.custom_id, 10)).filter(n => !isNaN(n)));
      let candidate = 1;
      while (candidate <= 9999999 && used.has(candidate)) candidate++;
      const newCustomId = candidate <= 9999999 ? candidate.toString().padStart(7, '0') : null;
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

// コース別（集金客のみ）一覧取得
router.get('/by-course/:courseId/collection', (req, res) => {
  const db = getDB();
  const courseId = req.params.courseId;

  const query = `
    SELECT c.id, c.custom_id, c.customer_name, c.address, c.phone, c.delivery_order,
           dc.course_name, ds.staff_name,
           cs.billing_method, cs.rounding_enabled
    FROM customers c
    LEFT JOIN customer_settings cs ON cs.customer_id = c.id
    LEFT JOIN delivery_courses dc ON c.course_id = dc.id
    LEFT JOIN delivery_staff ds ON c.staff_id = ds.id
    WHERE c.course_id = ? AND COALESCE(cs.billing_method, 'collection') = 'collection'
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

// 追加: コース別（口座振替のみ）一覧取得
router.get('/by-course/:courseId/debit', (req, res) => {
  const db = getDB();
  const courseId = req.params.courseId;

  const query = `
    SELECT c.id, c.custom_id, c.customer_name, c.address, c.phone, c.delivery_order,
           dc.course_name, ds.staff_name,
           cs.billing_method, cs.rounding_enabled
    FROM customers c
    LEFT JOIN customer_settings cs ON cs.customer_id = c.id
    LEFT JOIN delivery_courses dc ON c.course_id = dc.id
    LEFT JOIN delivery_staff ds ON c.staff_id = ds.id
    WHERE c.course_id = ? AND cs.billing_method = 'debit'
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

// 指定月の請求額（確定があればそれを優先／なければ試算）をコース別でまとめて返却
router.get('/by-course/:courseId/invoices-amounts', async (req, res) => {
  try {
    const result = await getCourseInvoiceAmounts(
      req.params.courseId,
      req.query.year,
      req.query.month,
      req.query.method,
    );
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('コース請求額取得エラー:', error);
    res.status(500).json({ error: error.message || 'コース請求額の取得に失敗しました' });
  }
});

// コース内顧客の月次請求ステータス一覧（1リクエストで返却）
router.get('/by-course/:courseId/invoices-status', async (req, res) => {
  try {
    const result = await getCourseInvoiceStatuses(
      req.params.courseId,
      req.query.year,
      req.query.month,
    );
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('コース請求ステータス取得エラー:', error);
    res.status(500).json({ error: error.message || 'コース請求ステータスの取得に失敗しました' });
  }
});

// コース内顧客の当月カレンダーを一括取得（2アップ一括プレビュー用）
router.get('/by-course/:courseId/calendars', async (req, res) => {
  try {
    const result = await getCourseCalendars(req.params.courseId, req.query.year, req.query.month);
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('コースカレンダー取得エラー:', error);
    res.status(500).json({ error: error.message || 'コースカレンダーの取得に失敗しました' });
  }
});

// 指定月の入金合計（金額）をコース別でまとめて返却（重複登録防止のための参考値）
router.get('/by-course/:courseId/payments-sum', async (req, res) => {
  try {
    const result = await getCoursePaymentsSum(
      req.params.courseId,
      req.query.year,
      req.query.month,
    );
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('コース入金合計取得エラー:', error);
    res.status(500).json({ error: error.message || 'コース入金合計の取得に失敗しました' });
  }
});

// ===== 入金一括登録（集金／口座振替） =====
router.post('/payments/batch', async (req, res) => {
  try {
    const result = await registerBatchPayments(req.body || {});
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('入金一括登録エラー:', error);
    res.status(500).json({ error: error.message || '入金一括登録に失敗しました' });
  }
});

// 配達順一括更新
router.put('/delivery-order/bulk', async (req, res) => {
  try {
    const result = await bulkUpdateDeliveryOrder(req.body?.updates);
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('配達順一括更新エラー:', error);
    res.status(500).json({ error: error.message || '配達順一括更新に失敗しました' });
  }
});

// 月次配達カレンダー生成
router.get('/:id/calendar/:year/:month', async (req, res) => {
  try {
    const { calendar, temporaryChanges } = await getCustomerCalendar(
      req.params.id,
      req.params.year,
      req.params.month,
    );
    res.json({ calendar, temporaryChanges });
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('月次配達カレンダー取得エラー:', error);
    res.status(500).json({ error: error.message || '月次配達カレンダーの取得に失敗しました' });
  }
});

// ===== 月次請求確定（売掛へ登録） =====
router.post('/:id/invoices/confirm', async (req, res) => {
  try {
    const result = await confirmInvoice(req.params.id, req.body?.year, req.body?.month);
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('月次請求確定エラー:', error);
    res.status(500).json({ error: error.message || '月次請求の確定に失敗しました' });
  }
});

// ===== 月次請求ステータス取得（確定済みか判定） =====
router.get('/:id/invoices/status', async (req, res) => {
  try {
    const status = await getInvoiceStatus(req.params.id, req.query.year, req.query.month);
    res.json(status);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('月次請求ステータス取得エラー:', error);
    res.status(500).json({ error: error.message || '月次請求ステータスの取得に失敗しました' });
  }
});

// ===== 月次請求の一括確定（コース単位／指定顧客／全顧客） =====
router.post('/invoices/confirm-batch', async (req, res) => {
  try {
    const result = await confirmInvoicesBatch(req.body || {});
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('月次請求一括確定エラー:', error);
    res.status(500).json({ error: error.message || '月次請求一括確定に失敗しました' });
  }
});

// ===== 月次請求の一括確定解除（コース単位／指定顧客／全顧客） =====
router.post('/invoices/unconfirm-batch', async (req, res) => {
  try {
    const result = await unconfirmInvoicesBatch(req.body || {});
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('月次請求一括確定解除エラー:', error);
    res.status(500).json({ error: error.message || '月次請求一括確定解除に失敗しました' });
  }
});

// ===== 月次請求の確定解除（顧客単位） =====
router.post('/:id/invoices/unconfirm', async (req, res) => {
  try {
    const result = await unconfirmInvoice(req.params.id, req.body?.year, req.body?.month);
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('月次請求確定解除エラー:', error);
    res.status(500).json({ error: error.message || '月次請求の確定解除に失敗しました' });
  }
});

// ===== 入金登録（現金集金／口座振替の個別登録） =====
router.post('/:id/payments', async (req, res) => {
  try {
    const result = await registerPayment(req.params.id, req.body || {});
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('入金登録エラー:', error);
    res.status(500).json({ error: error.message || '入金登録に失敗しました' });
  }
});

// ===== 入金一覧取得（フィルタ・検索） =====
router.get('/:id/payments', async (req, res) => {
  try {
    const rows = await listPayments(req.params.id, req.query || {});
    res.json(rows);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('入金一覧取得エラー:', error);
    res.status(500).json({ error: error.message || '入金一覧の取得に失敗しました' });
  }
});

// ===== 入金メモ編集 =====
router.patch('/:id/payments/:paymentId', async (req, res) => {
  try {
    const row = await updatePaymentNote(req.params.id, req.params.paymentId, req.body?.note);
    res.json(row);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('入金メモ編集エラー:', error);
    res.status(500).json({ error: error.message || '入金メモの更新に失敗しました' });
  }
});

// ===== 入金取消（マイナス入金の自動登録） =====
router.post('/:id/payments/:paymentId/cancel', async (req, res) => {
  try {
    const created = await cancelPayment(req.params.id, req.params.paymentId);
    res.json(created);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('入金取消エラー:', error);
    res.status(500).json({ error: error.message || '入金取消に失敗しました' });
  }
});

// module.exports = router; // moved to end

// AR（売掛）サマリ: 前月請求額／前月入金額／繰越額（暫定版）
// 既存の配達カレンダー生成を用いて「前月請求額」を試算し、入金・繰越は0で返す（将来、台帳導入で拡張）
router.get('/:id/ar-summary', async (req, res) => {
  try {
    const summary = await getArSummary(req.params.id, req.query.year, req.query.month);
    res.json(summary);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('ARサマリー取得エラー:', error);
    res.status(500).json({ error: error.message || 'ARサマリーの取得に失敗しました' });
  }
});

// ===== ARサマリー整合性テスト（前月請求額・繰越） =====
// 指定年月の「前月」を対象に、
// - 配達カレンダーからの試算額（totalRaw）
// - 切り上げ/四捨五入設定適用後の想定請求額（expectedAmount）
// - 売掛請求テーブル(ar_invoices)登録額（arInvoiceAmount）
// - ARサマリーAPIが返す前月請求額（arSummaryPrevInvoiceAmount）
// の一致状況を返す。
router.get('/:id/ar-summary/consistency', async (req, res) => {
  try {
    const consistency = await getArSummaryConsistency(
      req.params.id,
      req.query.year,
      req.query.month,
    );
    res.json(consistency);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('ARサマリー整合性テストエラー:', error);
    res.status(500).json({ error: error.message || 'ARサマリー整合性テストに失敗しました' });
  }
});

// 配達順序更新
router.put('/update-delivery-order', async (req, res) => {
  try {
    const result = await updateDeliveryOrderForCourse(req.body?.courseId, req.body?.customers);
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('配達順序更新エラー:', error);
    res.status(500).json({ error: error.message || '配達順序の更新に失敗しました' });
  }
});

// ===== 入金削除（履歴から完全削除） =====
router.delete('/:id/payments/:paymentId', async (req, res) => {
  try {
    const result = await deletePayment(req.params.id, req.params.paymentId);
    res.json(result);
  } catch (error) {
    if (error && error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('入金削除エラー:', error);
    res.status(500).json({ error: error.message || '入金削除に失敗しました' });
  }
});

module.exports = router;
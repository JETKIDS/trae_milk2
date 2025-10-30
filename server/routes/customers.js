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
      // 顧客IDは7桁ゼロ埋めに統一
      const paddedId = idTerm.padStart(7, '0');
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
    // custom_id（7桁ゼロパディング）で昇順
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

// 顧客の請求設定（請求方法・端数処理）を保存
router.put('/:id/settings', (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { billing_method, rounding_enabled, bank_code, branch_code, account_type, account_number, account_holder_katakana } = req.body;

  // テーブルが存在しなければ作成
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS customer_settings (
      customer_id INTEGER PRIMARY KEY,
      billing_method TEXT CHECK (billing_method IN ('collection','debit')),
      rounding_enabled INTEGER DEFAULT 1,
      bank_code TEXT,
      branch_code TEXT,
      account_type INTEGER CHECK (account_type IN (1,2)),
      account_number TEXT,
      account_holder_katakana TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `;

  db.exec(createTableSQL, (createErr) => {
    if (createErr) {
      return res.status(500).json({ error: createErr.message });
    }

    // 追加: 古いスキーマの場合、customer_settings に口座関連カラムを追加（マイグレーション）
    db.all("PRAGMA table_info(customer_settings)", (tiErr, rows) => {
      if (tiErr) {
        return res.status(500).json({ error: tiErr.message });
      }
      const names = (rows || []).map(r => r.name);
      const alters = [];
      if (!names.includes('bank_code')) alters.push("ALTER TABLE customer_settings ADD COLUMN bank_code TEXT");
      if (!names.includes('branch_code')) alters.push("ALTER TABLE customer_settings ADD COLUMN branch_code TEXT");
      if (!names.includes('account_type')) alters.push("ALTER TABLE customer_settings ADD COLUMN account_type INTEGER");
      if (!names.includes('account_number')) alters.push("ALTER TABLE customer_settings ADD COLUMN account_number TEXT");
      if (!names.includes('account_holder_katakana')) alters.push("ALTER TABLE customer_settings ADD COLUMN account_holder_katakana TEXT");
      if (!names.includes('updated_at')) alters.push("ALTER TABLE customer_settings ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");

      const runAlters = (cb) => {
        if (alters.length === 0) return cb();
        db.serialize(() => {
          let i = 0;
          const next = () => {
            if (i >= alters.length) return cb();
            const sql = alters[i];
            db.run(sql, (altErr) => {
              if (altErr) {
                console.error('スキーマ変更エラー:', altErr.message, 'SQL:', sql);
              }
              i++; next();
            });
          };
          next();
        });
      };

      runAlters(() => {
        // 顧客の存在チェック
        db.get('SELECT id FROM customers WHERE id = ?', [customerId], (custErr, custRow) => {
      if (custErr) {
        return res.status(500).json({ error: custErr.message });
      }
      if (!custRow) {
        return res.status(404).json({ error: '顧客が見つかりません' });
      }

      // UPSERT（INSERT or UPDATE）
      const upsertSQL = `
        INSERT INTO customer_settings (customer_id, billing_method, rounding_enabled, bank_code, branch_code, account_type, account_number, account_holder_katakana, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(customer_id) DO UPDATE SET
          billing_method = COALESCE(excluded.billing_method, customer_settings.billing_method),
          rounding_enabled = COALESCE(excluded.rounding_enabled, customer_settings.rounding_enabled),
          bank_code = COALESCE(excluded.bank_code, customer_settings.bank_code),
          branch_code = COALESCE(excluded.branch_code, customer_settings.branch_code),
          account_type = COALESCE(excluded.account_type, customer_settings.account_type),
          account_number = COALESCE(excluded.account_number, customer_settings.account_number),
          account_holder_katakana = COALESCE(excluded.account_holder_katakana, customer_settings.account_holder_katakana),
          updated_at = CURRENT_TIMESTAMP
      `;

      const method = (billing_method === 'debit' || billing_method === 'collection') ? billing_method : null;
      const rounding = (typeof rounding_enabled === 'number') ? rounding_enabled : (typeof rounding_enabled === 'boolean') ? (rounding_enabled ? 1 : 0) : null;

      // bank fields validation (optional; if provided)
      const digit4 = (s) => typeof s === 'string' && /^\d{4}$/.test(s);
      const digit3 = (s) => typeof s === 'string' && /^\d{3}$/.test(s);
      const digit7 = (s) => typeof s === 'string' && /^\d{7}$/.test(s);
      const typeValid = (t) => t === 1 || t === 2 || t === null || t === undefined;
      const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/; // 半角カナとスペースのみ許容
      if (bank_code !== undefined && bank_code !== null && !digit4(bank_code)) {
        return res.status(400).json({ error: '金融機関コードは4桁の数字で入力してください' });
      }
      if (branch_code !== undefined && branch_code !== null && !digit3(branch_code)) {
        return res.status(400).json({ error: '支店コードは3桁の数字で入力してください' });
      }
      if (account_number !== undefined && account_number !== null && !digit7(account_number)) {
        return res.status(400).json({ error: '口座番号は7桁の数字で入力してください' });
      }
      if (!typeValid(account_type)) {
        return res.status(400).json({ error: '預金種別は 1（普通）または 2（当座）で入力してください' });
      }
      if (account_holder_katakana !== undefined && account_holder_katakana !== null) {
        const s = String(account_holder_katakana);
        if (s.length === 0 || !halfKanaRegex.test(s)) {
          return res.status(400).json({ error: '口座名義は半角カタカナで入力してください（スペース可）' });
        }
      }

      db.run(upsertSQL, [customerId, method, rounding, bank_code || null, branch_code || null, account_type ?? null, account_number || null, account_holder_katakana || null], function(upsertErr) {
        if (upsertErr) {
          return res.status(500).json({ error: upsertErr.message });
        }
        // 追加: 保存後の行内容をログ出力（診断用）
        db.get('SELECT billing_method, rounding_enabled, bank_code, branch_code, account_type, account_number, account_holder_katakana FROM customer_settings WHERE customer_id = ?', [customerId], (selErr, row) => {
          if (selErr) {
            console.error('保存後の設定取得エラー:', selErr);
          } else {
            console.log('✅ 保存後の設定:', row);
          }
          return res.json({ message: '設定を保存しました', customer_id: customerId, billing_method: method, rounding_enabled: rounding });
        });
        });
      });
    });
  });
});
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
      // 顧客IDは7桁ゼロ埋めに統一
      const paddedId = idTerm.padStart(7, '0');
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
    // 7桁のゼロ埋め文字列のため文字列昇順でOK
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

// 次の顧客ID（未使用の最小7桁ID）を返す - 動的ルートより前に定義
router.get('/next-id', (req, res) => {
  const db = getDB();
  const query = `SELECT custom_id FROM customers WHERE LENGTH(custom_id) = 7 AND custom_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'`;
  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    const used = new Set(rows.map(r => parseInt(r.custom_id, 10)).filter(n => !isNaN(n)));
    let candidate = 1;
    while (candidate <= 9999999 && used.has(candidate)) candidate++;
    const nextId = candidate <= 9999999 ? candidate.toString().padStart(7, '0') : null;
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
    SELECT dp.*, p.product_name, p.unit, m.manufacturer_name, m.id AS manufacturer_id
    FROM delivery_patterns dp
    JOIN products p ON dp.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE dp.customer_id = ? AND dp.is_active = 1
  `;
  
  db.get(customerQuery, [customerId], (err, customer) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }

    if (!customer) {
      res.status(404).json({ error: '顧客が見つかりません' });
      db.close();
      return;
    }

    db.all(patternsQuery, [customerId], (err, patterns) => {
      if (err) {
        res.status(500).json({ error: err.message });
        db.close();
        return;
      }
      // 顧客設定（請求方法・端数処理・口座情報）も返却
      const settingsQuery = `
        CREATE TABLE IF NOT EXISTS customer_settings (
          customer_id INTEGER PRIMARY KEY,
          billing_method TEXT CHECK (billing_method IN ('collection','debit')),
          rounding_enabled INTEGER DEFAULT 1,
          bank_code TEXT,
          branch_code TEXT,
          account_type INTEGER CHECK (account_type IN (1,2)),
          account_number TEXT,
          account_holder_katakana TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id)
        )
      `;

      db.exec(settingsQuery, (createErr) => {
        if (createErr) {
          console.error('顧客設定テーブル作成エラー:', createErr);
        }
        db.get('SELECT billing_method, rounding_enabled, bank_code, branch_code, account_type, account_number, account_holder_katakana FROM customer_settings WHERE customer_id = ?', [customerId], (settingsErr, settingsRow) => {
          if (settingsErr) {
            res.status(500).json({ error: settingsErr.message });
            db.close();
            return;
          }
          res.json({
            customer,
            patterns,
            settings: settingsRow || null
          });
          db.close();
        });
      });
    });
  });
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
  const db = getDB();
  const courseId = req.params.courseId;
  const { year, month, method } = req.query;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  const methodStr = method === 'debit' ? 'debit' : 'collection';

  try {
    await ensureLedgerTables(db);
    const customers = await new Promise((resolve, reject) => {
      const sql = `
        SELECT c.id, c.custom_id, c.customer_name,
               cs.rounding_enabled
        FROM customers c
        LEFT JOIN customer_settings cs ON cs.customer_id = c.id
        WHERE c.course_id = ? AND COALESCE(cs.billing_method, 'collection') = ?
        ORDER BY c.delivery_order ASC, c.id ASC
      `;
      db.all(sql, [courseId, methodStr], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    const results = [];
    for (const c of customers) {
      const roundingEnabled = c.rounding_enabled === 1 || c.rounding_enabled === null || typeof c.rounding_enabled === 'undefined' ? true : c.rounding_enabled === 1;
      const invRow = await new Promise((resolve, reject) => {
        db.get('SELECT amount, status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?', [c.id, y, m], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
      let amount;
      let confirmed = false;
      if (invRow && typeof invRow.amount === 'number') {
        amount = invRow.amount;
        confirmed = String(invRow.status || 'confirmed') === 'confirmed';
      } else {
        const totalRaw = await computeMonthlyTotal(db, c.id, y, m);
        amount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
      }
      results.push({ customer_id: c.id, amount, confirmed, rounding_enabled: roundingEnabled ? 1 : 0 });
    }

    db.close();
    return res.json({ year: y, month: m, method: methodStr, items: results });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// 指定月の入金合計（金額）をコース別でまとめて返却（重複登録防止のための参考値）
router.get('/by-course/:courseId/payments-sum', async (req, res) => {
  const db = getDB();
  const courseId = req.params.courseId;
  const { year, month } = req.query;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);
    const sql = `
      SELECT c.id AS customer_id, COALESCE(SUM(p.amount), 0) AS total
      FROM customers c
      LEFT JOIN ar_payments p
        ON p.customer_id = c.id AND p.year = ? AND p.month = ?
      WHERE c.course_id = ?
      GROUP BY c.id
      ORDER BY c.delivery_order ASC, c.id ASC
    `;
    const rows = await new Promise((resolve, reject) => {
      db.all(sql, [y, m, courseId], (err, r) => {
        if (err) return reject(err);
        resolve(r || []);
      });
    });
    db.close();
    return res.json({ year: y, month: m, items: rows });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 入金一括登録（集金／口座振替） =====
router.post('/payments/batch', async (req, res) => {
  const db = getDB();
  const { year, month, entries, method } = req.body; // entries: [{ customer_id, amount, note? }]
  if (!year || !month || !entries || !Array.isArray(entries) || entries.length === 0) {
    db.close();
    return res.status(400).json({ error: 'year, month, entries は必須です' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }
  const methodStr = method === 'debit' ? 'debit' : 'collection';
  try {
    await ensureLedgerTables(db);

    // 対象年月が月次確定済みの顧客のみ入金登録を許可する
    const confirmedRows = await new Promise((resolve, reject) => {
      db.all(
        'SELECT customer_id FROM ar_invoices WHERE year = ? AND month = ?',
        [y, m],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
    const confirmedSet = new Set(confirmedRows.map(r => Number(r.customer_id)));

    let success = 0;
    let failed = 0;
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare(
          `INSERT INTO ar_payments (customer_id, year, month, amount, method, note)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const e of entries) {
          const cid = parseInt(String(e.customer_id), 10);
          const amt = parseInt(String(e.amount), 10);
          const note = e.note ? String(e.note) : null;
          if (isNaN(cid) || isNaN(amt) || amt <= 0) { failed++; continue; }
          if (!confirmedSet.has(cid)) { failed++; continue; }
          stmt.run([cid, y, m, amt, methodStr, note], (err) => {
            if (err) { failed++; }
            else { success++; }
          });
        }
        stmt.finalize((finErr) => {
          if (finErr) {
            db.run('ROLLBACK');
            return reject(finErr);
          }
          db.run('COMMIT', (commitErr) => {
            if (commitErr) return reject(commitErr);
            resolve(null);
          });
        });
      });
    });
    db.close();
    return res.json({ year: y, month: m, method: methodStr, success, failed });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
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
    SELECT dp.*, p.product_name, p.unit, m.manufacturer_name
    FROM delivery_patterns dp
    JOIN products p ON dp.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE dp.customer_id = ? AND dp.is_active = 1
  `;
  
  // 指定月の臨時変更を取得（当月のみ、add/modify/skip すべて）
  const temporaryQuery = `
    SELECT 
      tc.*, 
      p.product_name, 
      p.unit_price AS product_unit_price, 
      p.unit, 
      m.manufacturer_name
    FROM temporary_changes tc
    JOIN products p ON tc.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE tc.customer_id = ? 
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
  const safeParse = (val) => {
    try { return JSON.parse(val); } catch { return val; }
  };
  const ensureArrayDays = (days) => {
    if (Array.isArray(days)) return days;
    if (typeof days === 'string') {
      const p1 = safeParse(days);
      if (Array.isArray(p1)) return p1;
      if (typeof p1 === 'string') {
        const p2 = safeParse(p1);
        if (Array.isArray(p2)) return p2;
      }
    }
    return [];
  };
  const ensureObject = (objStr) => {
    if (!objStr) return {};
    if (typeof objStr === 'object') return objStr || {};
    if (typeof objStr === 'string') {
      const p1 = safeParse(objStr);
      if (p1 && typeof p1 === 'object') return p1;
      if (typeof p1 === 'string') {
        const p2 = safeParse(p1);
        if (p2 && typeof p2 === 'object') return p2;
      }
    }
    return {};
  };
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
    
    // 定期配達パターンの処理（同一商品の重複パターンが同日に存在する場合は、開始日の新しいものを優先）
    const validPatterns = patterns.filter(pattern => {
      if (pattern.start_date && moment(currentDateStr).isBefore(moment(pattern.start_date))) {
        return false; // 開始日前は除外
      }
      if (pattern.end_date && moment(currentDateStr).isAfter(moment(pattern.end_date))) {
        return false; // 終了日後は除外
      }
      return true;
    });

    const latestByProduct = new Map(); // product_id -> pattern（開始日が最も新しいもの）
    validPatterns.forEach(p => {
      const key = p.product_id;
      const existing = latestByProduct.get(key);
      if (!existing || moment(p.start_date).isAfter(moment(existing.start_date))) {
        latestByProduct.set(key, p);
      }
    });

    Array.from(latestByProduct.values()).forEach(pattern => {
      let quantity = 0;

      // daily_quantitiesがある場合はそれを使用（2重JSONにも対応）
      if (pattern.daily_quantities) {
        const dailyQuantities = ensureObject(pattern.daily_quantities);
        quantity = dailyQuantities[dayOfWeek] || 0;
      } else {
        // 従来の方式（後方互換性、2重JSONにも対応）
        const deliveryDays = ensureArrayDays(pattern.delivery_days || []);
        if (deliveryDays.includes(dayOfWeek)) {
          quantity = pattern.quantity || 0;
        }
      }

      // 当日・該当商品の臨時変更を適用（skip/modify）
      const dayChangesForProduct = temporaryChanges
        .filter(tc => tc.change_date === currentDateStr && tc.product_id === pattern.product_id);

      // skip が存在すれば数量は0（最優先）
      const hasSkip = dayChangesForProduct.some(tc => tc.change_type === 'skip');
      if (hasSkip) {
        quantity = 0;
      } else {
        // 最新のmodify（created_atが新しいものを優先）を適用
        const modifyChanges = dayChangesForProduct
          .filter(tc => tc.change_type === 'modify' && tc.quantity !== null && tc.quantity !== undefined)
          .sort((a, b) => {
            const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bd - ad; // desc
          });
        if (modifyChanges.length > 0) {
          const latestModify = modifyChanges[0];
          quantity = Number(latestModify.quantity) || 0;
          // 単価の臨時変更がある場合はそれも適用（指定があれば）
          if (latestModify.unit_price !== null && latestModify.unit_price !== undefined) {
            pattern.unit_price = latestModify.unit_price;
          }
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
    
    // 臨時配達（add）の処理（当月のみ）：通常配達とは別枠で表示
    temporaryChanges.forEach(tempChange => {
      if (
        tempChange.change_date === currentDateStr &&
        tempChange.change_type === 'add' &&
        tempChange.quantity > 0
      ) {
        const unitPrice = (tempChange.unit_price !== null && tempChange.unit_price !== undefined)
          ? tempChange.unit_price
          : tempChange.product_unit_price;
        dayData.products.push({
          productName: `（臨時）${tempChange.product_name}`,
          quantity: tempChange.quantity,
          unitPrice: unitPrice,
          unit: tempChange.unit,
          amount: tempChange.quantity * unitPrice
        });
      }
    });
    
    calendar.push(dayData);
  }
  
  return calendar;
}



// ===== 売掛台帳ユーティリティ =====
function ensureLedgerTables(db) {
  const sql = `
    CREATE TABLE IF NOT EXISTS ar_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      rounding_enabled INTEGER NOT NULL,
      status TEXT DEFAULT 'confirmed',
      confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(customer_id, year, month),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS ar_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT CHECK (method IN ('collection','debit')),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `;
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 基本テーブル作成
      db.exec(sql, (err) => {
        if (err) return reject(err);
        // 既存DBに不足カラムがある場合は追加（軽量な簡易マイグレーション）
        db.all("PRAGMA table_info(ar_invoices)", [], (e1, invCols) => {
          if (e1) return reject(e1);
          const invNames = (invCols || []).map(r => r.name);
          const alterOps = [];
          if (!invNames.includes('status')) {
            alterOps.push("ALTER TABLE ar_invoices ADD COLUMN status TEXT DEFAULT 'confirmed'");
          }
          if (!invNames.includes('confirmed_at')) {
            alterOps.push("ALTER TABLE ar_invoices ADD COLUMN confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP");
          }
          if (!invNames.includes('rounding_enabled')) {
            // 既存DBにない場合はデフォルト0で追加
            alterOps.push("ALTER TABLE ar_invoices ADD COLUMN rounding_enabled INTEGER DEFAULT 0");
          }

          db.all("PRAGMA table_info(ar_payments)", [], (e2, payCols) => {
            if (e2) return reject(e2);
            const payNames = (payCols || []).map(r => r.name);
            if (!payNames.includes('method')) {
              alterOps.push("ALTER TABLE ar_payments ADD COLUMN method TEXT");
            }
            if (!payNames.includes('note')) {
              alterOps.push("ALTER TABLE ar_payments ADD COLUMN note TEXT");
            }
            if (!payNames.includes('created_at')) {
              alterOps.push("ALTER TABLE ar_payments ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
            }

            if (alterOps.length === 0) {
              return resolve();
            }
            const alterSql = alterOps.join('; ');
            db.exec(alterSql, (e3) => {
              if (e3) return reject(e3);
              resolve();
            });
          });
        });
      });
    });
  });
}

async function computeMonthlyTotal(db, customerId, year, month) {
  return new Promise((resolve, reject) => {
    const patternsQuery = `
      SELECT dp.*, p.product_name, p.unit, m.manufacturer_name
      FROM delivery_patterns dp
      JOIN products p ON dp.product_id = p.id
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE dp.customer_id = ?
    `;

    const temporaryQuery = `
      SELECT 
        tc.*, 
        p.product_name, 
        p.unit_price AS product_unit_price, 
        p.unit, 
        m.manufacturer_name
      FROM temporary_changes tc
      JOIN products p ON tc.product_id = p.id
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE tc.customer_id = ?
        AND strftime('%Y', tc.change_date) = ?
        AND strftime('%m', tc.change_date) = ?
    `;

    db.all(patternsQuery, [customerId], (pErr, patterns) => {
      if (pErr) return reject(pErr);
      db.all(temporaryQuery, [customerId, String(year), String(month).padStart(2, '0')], (tErr, temporaryChanges) => {
        if (tErr) return reject(tErr);
        const calendar = generateMonthlyCalendar(year, month, patterns, temporaryChanges);
        const totalRaw = calendar.reduce((sum, day) => sum + day.products.reduce((s, p) => s + (p.amount || 0), 0), 0);
        resolve(totalRaw);
      });
    });
  });
}

// ===== 月次請求確定（売掛へ登録） =====
router.post('/:id/invoices/confirm', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { year, month } = req.body;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);

    // 端数設定取得（デフォルトON）
    const roundingRow = await new Promise((resolve, reject) => {
      db.get('SELECT rounding_enabled FROM customer_settings WHERE customer_id = ?', [customerId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    const roundingEnabled = roundingRow ? (roundingRow.rounding_enabled === 1) : true;

    const totalRaw = await computeMonthlyTotal(db, customerId, y, m);
    const amountRaw = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
    const amount = Math.max(0, amountRaw);

    // UPSERT（顧客×年月は一意）
    await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status)
        VALUES (?, ?, ?, ?, ?, 'confirmed')
        ON CONFLICT(customer_id, year, month) DO UPDATE SET
          amount = excluded.amount,
          rounding_enabled = excluded.rounding_enabled,
          status = 'confirmed',
          confirmed_at = CURRENT_TIMESTAMP
      `;
      db.run(sql, [customerId, y, m, amount, roundingEnabled ? 1 : 0], function(err) {
        if (err) return reject(err);
        resolve();
      });
    });

    db.close();
    return res.json({ customer_id: Number(customerId), year: y, month: m, amount, rounding_enabled: roundingEnabled });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 月次請求ステータス取得（確定済みか判定） =====
router.get('/:id/invoices/status', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { year, month } = req.query;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);
    const row = await new Promise((resolve, reject) => {
      db.get(
        'SELECT amount, rounding_enabled, confirmed_at FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?',
        [customerId, y, m],
        (err, r) => {
          if (err) return reject(err);
          resolve(r);
        }
      );
    });
    db.close();
    if (row) {
      return res.json({
        confirmed: true,
        amount: row.amount,
        rounding_enabled: row.rounding_enabled === 1,
        confirmed_at: row.confirmed_at,
      });
    }
    return res.json({ confirmed: false });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 月次請求の一括確定（コース単位／指定顧客／全顧客） =====
router.post('/invoices/confirm-batch', async (req, res) => {
  const db = getDB();
  const { year, month, course_id, customer_ids } = req.body;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);

    // 対象顧客の抽出
    let targets = [];
    if (Array.isArray(customer_ids) && customer_ids.length > 0) {
      targets = customer_ids.map((cid) => parseInt(String(cid), 10)).filter((n) => !isNaN(n));
    } else if (typeof course_id !== 'undefined') {
      const courseId = parseInt(String(course_id), 10);
      if (isNaN(courseId)) {
        db.close();
        return res.status(400).json({ error: 'course_id の形式が不正です' });
      }
      const customersInCourse = await new Promise((resolve, reject) => {
        db.all('SELECT id FROM customers WHERE course_id = ?', [courseId], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
      targets = customersInCourse.map((r) => r.id);
    } else {
      const allCustomers = await new Promise((resolve, reject) => {
        db.all('SELECT id FROM customers', [], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
      targets = allCustomers.map((r) => r.id);
    }

    // トランザクションで一括確定
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN', (bErr) => {
          if (bErr) return reject(bErr);

          const proceed = async () => {
            const results = [];
            try {
              for (const customerId of targets) {
                // 端数設定（デフォルトON）
                const roundingRow = await new Promise((res2, rej2) => {
                  db.get('SELECT rounding_enabled FROM customer_settings WHERE customer_id = ?', [customerId], (err, row) => {
                    if (err) return rej2(err);
                    res2(row);
                  });
                });
                const roundingEnabled = roundingRow ? (roundingRow.rounding_enabled === 1) : true;

                const totalRaw = await computeMonthlyTotal(db, customerId, y, m);
                const amountRaw = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
                const amount = Math.max(0, amountRaw);

                await new Promise((res3, rej3) => {
                  const sql = `
                    INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status)
                    VALUES (?, ?, ?, ?, ?, 'confirmed')
                    ON CONFLICT(customer_id, year, month) DO UPDATE SET
                      amount = excluded.amount,
                      rounding_enabled = excluded.rounding_enabled,
                      status = 'confirmed',
                      confirmed_at = CURRENT_TIMESTAMP
                  `;
                  db.run(sql, [customerId, y, m, amount, roundingEnabled ? 1 : 0], function(err) {
                    if (err) return rej3(err);
                    res3();
                  });
                });

                results.push({ customer_id: customerId, year: y, month: m, amount, rounding_enabled: roundingEnabled });
              }

              db.run('COMMIT', (cErr) => {
                if (cErr) return reject(cErr);
                resolve(results);
              });
            } catch (loopErr) {
              db.run('ROLLBACK', () => {
                reject(loopErr);
              });
            }
          };

          proceed();
        });
      });
    }).then((results) => {
      db.close();
      return res.json({ year: y, month: m, count: targets.length, results });
    }).catch((err) => {
      db.close();
      return res.status(500).json({ error: err.message });
    });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 月次請求の一括確定解除（コース単位／指定顧客／全顧客） =====
router.post('/invoices/unconfirm-batch', async (req, res) => {
  const db = getDB();
  const { year, month, course_id, customer_ids } = req.body;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);

    // 対象顧客の抽出
    let targets = [];
    if (Array.isArray(customer_ids) && customer_ids.length > 0) {
      targets = customer_ids.map((cid) => parseInt(String(cid), 10)).filter((n) => !isNaN(n));
    } else if (typeof course_id !== 'undefined') {
      const courseId = parseInt(String(course_id), 10);
      if (isNaN(courseId)) {
        db.close();
        return res.status(400).json({ error: 'course_id の形式が不正です' });
      }
      const customersInCourse = await new Promise((resolve, reject) => {
        db.all('SELECT id FROM customers WHERE course_id = ?', [courseId], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
      targets = customersInCourse.map((r) => r.id);
    } else {
      const allCustomers = await new Promise((resolve, reject) => {
        db.all('SELECT id FROM customers', [], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
      targets = allCustomers.map((r) => r.id);
    }

    // トランザクションで一括確定解除（該当月の売掛請求レコードを削除）
    const results = await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN', (bErr) => {
          if (bErr) return reject(bErr);

          const doWork = async () => {
            const out = [];
            try {
              for (const customerId of targets) {
                const deleted = await new Promise((resDel, rejDel) => {
                  const sql = 'DELETE FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?';
                  db.run(sql, [customerId, y, m], function(delErr) {
                    if (delErr) return rejDel(delErr);
                    resDel(this.changes || 0);
                  });
                });
                out.push({ customer_id: customerId, year: y, month: m, removed_count: deleted });
              }
              db.run('COMMIT', (cErr) => {
                if (cErr) return reject(cErr);
                resolve(out);
              });
            } catch (loopErr) {
              db.run('ROLLBACK', () => {
                reject(loopErr);
              });
            }
          };

          doWork();
        });
      });
    });

    db.close();
    return res.json({ year: y, month: m, count: targets.length, results });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 月次請求の確定解除（顧客単位） =====
router.post('/:id/invoices/unconfirm', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { year, month } = req.body;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);
    await new Promise((resolve, reject) => {
      const sql = 'DELETE FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?';
      db.run(sql, [customerId, y, m], function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
    db.close();
    return res.json({ customer_id: Number(customerId), year: y, month: m, removed: true });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 入金登録（現金集金／口座振替の個別登録） =====
router.post('/:id/payments', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { year, month, amount, method, note } = req.body;
  if (!year || !month || !amount || !method) {
    db.close();
    return res.status(400).json({ error: 'year, month, amount, method は必須です' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  const amt = parseInt(String(amount), 10);
  if ([y, m, amt].some(v => isNaN(v)) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month/amount の形式が不正です' });
  }
  if (!['collection','debit'].includes(String(method))) {
    db.close();
    return res.status(400).json({ error: 'method は collection または debit を指定してください' });
  }

  try {
    await ensureLedgerTables(db);

    // 対象年月が月次確定済みかをチェック（未確定の場合は入金登録を拒否）
    const inv = await new Promise((resolve, reject) => {
      db.get(
        'SELECT status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?',
        [customerId, y, m],
        (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        }
      );
    });
    // 集金（collection）の場合は未確定でも登録を許可、引き落し（debit）の場合は確定必須
    const methodStr = String(method);
    const isConfirmed = inv && String(inv.status) === 'confirmed';
    if (methodStr === 'debit' && !isConfirmed) {
      db.close();
      return res.status(400).json({ error: '引き落し入金は指定年月の請求確定が必要です。先に月次確定を行ってください。' });
    }

    await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO ar_payments (customer_id, year, month, amount, method, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [customerId, y, m, amt, String(method), note || null], function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
    db.close();
    return res.json({ customer_id: Number(customerId), year: y, month: m, amount: amt, method: String(method), note: note || null });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 入金一覧取得（フィルタ・検索） =====
router.get('/:id/payments', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { year, month, method, q, limit, offset } = req.query;
  const y = year ? parseInt(String(year), 10) : undefined;
  const m = month ? parseInt(String(month), 10) : undefined;
  const lim = limit ? parseInt(String(limit), 10) : 100;
  const off = offset ? parseInt(String(offset), 10) : 0;
  if ([y, m, lim, off].some((v) => typeof v !== 'undefined' && isNaN(Number(v)))) {
    db.close();
    return res.status(400).json({ error: 'year/month/limit/offset の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);
    const where = ['customer_id = ?'];
    const params = [customerId];
    if (typeof y === 'number') { where.push('year = ?'); params.push(y); }
    if (typeof m === 'number') { where.push('month = ?'); params.push(m); }
    if (method && ['collection','debit'].includes(String(method))) { where.push('method = ?'); params.push(String(method)); }
    if (q && String(q).trim() !== '') { where.push('note LIKE ?'); params.push(`%${String(q).trim()}%`); }
    const sql = `
      SELECT id, customer_id, year, month, amount, method, note, created_at
      FROM ar_payments
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;
    params.push(lim);
    params.push(off);
    const rows = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, r) => { if (err) return reject(err); resolve(r || []); });
    });
    db.close();
    return res.json(rows);
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 入金メモ編集 =====
router.patch('/:id/payments/:paymentId', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const paymentId = parseInt(String(req.params.paymentId), 10);
  const { note } = req.body || {};
  if (isNaN(paymentId)) {
    db.close();
    return res.status(400).json({ error: 'paymentId が不正です' });
  }
  try {
    await ensureLedgerTables(db);
    await new Promise((resolve, reject) => {
      db.run('UPDATE ar_payments SET note = ? WHERE id = ? AND customer_id = ?', [note || null, paymentId, customerId], function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT id, customer_id, year, month, amount, method, note, created_at FROM ar_payments WHERE id = ?', [paymentId], (err, r) => {
        if (err) return reject(err);
        resolve(r);
      });
    });
    db.close();
    return res.json(row);
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// ===== 入金取消（マイナス入金の自動登録） =====
  router.post('/:id/payments/:paymentId/cancel', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const paymentId = parseInt(String(req.params.paymentId), 10);
  if (isNaN(paymentId)) {
    db.close();
    return res.status(400).json({ error: 'paymentId が不正です' });
  }
  try {
    await ensureLedgerTables(db);
    const orig = await new Promise((resolve, reject) => {
      db.get('SELECT id, customer_id, year, month, amount, method, note FROM ar_payments WHERE id = ? AND customer_id = ?', [paymentId, customerId], (err, r) => {
        if (err) return reject(err);
        resolve(r || null);
      });
    });
    if (!orig) {
      db.close();
      return res.status(404).json({ error: '対象の入金が見つかりません' });
    }
    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO ar_payments (customer_id, year, month, amount, method, note) VALUES (?, ?, ?, ?, ?, ?)`;
      const cancelNote = `取消: ${orig.id}${orig.note ? ` (${orig.note})` : ''}`;
      db.run(sql, [customerId, orig.year, orig.month, -Math.abs(orig.amount), String(orig.method), cancelNote], function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
    // 取消レコードを返す（最新の作成分）
    const created = await new Promise((resolve, reject) => {
      db.get('SELECT id, customer_id, year, month, amount, method, note, created_at FROM ar_payments WHERE customer_id = ? ORDER BY id DESC LIMIT 1', [customerId], (err, r) => {
        if (err) return reject(err);
        resolve(r);
      });
    });
    db.close();
    return res.json(created);
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

// module.exports = router; // moved to end

// AR（売掛）サマリ: 前月請求額／前月入金額／繰越額（暫定版）
// 既存の配達カレンダー生成を用いて「前月請求額」を試算し、入金・繰越は0で返す（将来、台帳導入で拡張）
router.get('/:id/ar-summary', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const { year, month } = req.query;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }

  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);

    // 前月
    const prevMoment = moment(`${y}-${String(m).padStart(2, '0')}-01`).subtract(1, 'month');
    const prevYear = parseInt(prevMoment.format('YYYY'), 10);
    const prevMonth = parseInt(prevMoment.format('MM'), 10);

    // 端数設定（デフォルトON）
    const roundingRow = await new Promise((resolve, reject) => {
      db.get('SELECT rounding_enabled FROM customer_settings WHERE customer_id = ?', [customerId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

// （注意）整合性テストルートは ar-summary ルートの外に定義する必要があるため、ここでは削除し、ファイル末尾で再定義します。
    const roundingEnabled = roundingRow ? (roundingRow.rounding_enabled === 1) : true;

    // 前月請求額：確定済みがあれば優先、なければカレンダーから試算
    const invoiceRow = await new Promise((resolve, reject) => {
      db.get('SELECT amount FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?', [customerId, prevYear, prevMonth], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    let prevInvoiceAmount;
    if (invoiceRow && typeof invoiceRow.amount === 'number') {
      prevInvoiceAmount = invoiceRow.amount;
    } else {
      const totalRaw = await computeMonthlyTotal(db, customerId, prevYear, prevMonth);
      prevInvoiceAmount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
    }

    // 前月入金額：当該（前月）年月の入金合計
    const paymentRow = await new Promise((resolve, reject) => {
      db.get('SELECT COALESCE(SUM(amount), 0) AS total FROM ar_payments WHERE customer_id = ? AND year = ? AND month = ?', [customerId, prevYear, prevMonth], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    const prevPaymentAmount = paymentRow ? (paymentRow.total || 0) : 0;

    // 当月入金額：現在指定の year/month の入金合計
    const currentPaymentRow = await new Promise((resolve, reject) => {
      db.get('SELECT COALESCE(SUM(amount), 0) AS total FROM ar_payments WHERE customer_id = ? AND year = ? AND month = ?', [customerId, y, m], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    const currentPaymentAmount = currentPaymentRow ? (currentPaymentRow.total || 0) : 0;

    // 繰越額：（前月請求額）-（当月入金額）
    // 牛乳屋の業務フロー：前月の集金額に対して翌月（当月）に入金される
    const carryoverAmount = (prevInvoiceAmount || 0) - currentPaymentAmount;

    db.close();
    return res.json({
      prev_year: prevYear,
      prev_month: prevMonth,
      prev_invoice_amount: prevInvoiceAmount,
      prev_payment_amount: prevPaymentAmount,
      carryover_amount: carryoverAmount,
    });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
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
  const db = getDB();
  const customerId = req.params.id;
  const { year, month } = req.query;
  if (!year || !month) {
    db.close();
    return res.status(400).json({ error: 'year と month を指定してください' });
  }
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    db.close();
    return res.status(400).json({ error: 'year/month の形式が不正です' });
  }

  try {
    await ensureLedgerTables(db);

    // 前月の算出
    const prevMoment = moment(`${y}-${String(m).padStart(2, '0')}-01`).subtract(1, 'month');
    const prevYear = parseInt(prevMoment.format('YYYY'), 10);
    const prevMonth = parseInt(prevMoment.format('MM'), 10);

    // 端数設定（confirm-batch と同じロジック：customer_settings.rounding_enabled を使用）
    const roundingEnabled = await new Promise((resolve) => {
      db.get('SELECT rounding_enabled FROM customer_settings WHERE customer_id = ?', [customerId], (err, row) => {
        if (err) {
          console.error('端数設定取得エラー:', err);
          resolve(true);
        } else {
          resolve(row ? (row.rounding_enabled === 1) : true);
        }
      });
    });

    // 配達データからの試算
    const totalRaw = await computeMonthlyTotal(db, customerId, prevYear, prevMonth);
    // confirm-batch と同一の丸め（10円単位の切り捨て）
    const expectedAmount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;

    // 売掛請求テーブル登録額
    const arInvoiceAmount = await new Promise((resolve) => {
      db.get('SELECT amount FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?', [customerId, prevYear, prevMonth], (err, row) => {
        if (err) {
          console.error('AR請求取得エラー:', err);
          resolve(null);
        } else {
          resolve(row?.amount ?? null);
        }
      });
    });

    // ARサマリーAPIの値（前月請求額・繰越）
    const arSummary = await new Promise((resolve) => {
      db.get('SELECT COALESCE(SUM(amount), 0) AS total FROM ar_payments WHERE customer_id = ? AND year = ? AND month = ?', [customerId, prevYear, prevMonth], (pErr, pRow) => {
        const prevPaymentTotal = pRow?.total || 0;
        db.get('SELECT amount FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?', [customerId, prevYear, prevMonth], (iErr, iRow) => {
          const prevInvoiceFromAR = iRow?.amount ?? null;
          // サマリーの前月請求額は「ARに存在すればそれを、なければ配達試算」を採用
          const prevInvoiceAmount = prevInvoiceFromAR ?? totalRaw;
          db.get('SELECT COALESCE(SUM(amount), 0) AS total FROM ar_invoices WHERE customer_id = ? AND (year < ? OR (year = ? AND month <= ?))', [customerId, prevYear, prevYear, prevMonth], (cumInvErr, cumInvRow) => {
            db.get('SELECT COALESCE(SUM(amount), 0) AS total FROM ar_payments WHERE customer_id = ? AND (year < ? OR (year = ? AND month <= ?))', [customerId, prevYear, prevYear, prevMonth], (cumPayErr, cumPayRow) => {
              const carryoverAmount = (cumInvRow?.total || 0) - (cumPayRow?.total || 0);
              resolve({ prevInvoiceAmount, carryoverAmount, prevPaymentTotal });
            });
          });
        });
      });
    });

    const consistency = {
      prevYear,
      prevMonth,
      rounding_enabled: Boolean(roundingEnabled),
      totalRaw,
      expectedAmount,
      arInvoiceAmount,
      arSummaryPrevInvoiceAmount: arSummary.prevInvoiceAmount,
      carryoverAmountFromSummary: arSummary.carryoverAmount,
      prevPaymentTotal: arSummary.prevPaymentTotal,
      isPrevInvoiceEqualToExpected: arInvoiceAmount === null ? false : arInvoiceAmount === expectedAmount,
      isSummaryUsingARAmount: arInvoiceAmount === null ? arSummary.prevInvoiceAmount === totalRaw : arSummary.prevInvoiceAmount === arInvoiceAmount
    };

    db.close();
    return res.json(consistency);
  } catch (e) {
    console.error('ARサマリー整合性テスト失敗:', e);
    db.close();
    return res.status(500).json({ error: 'ARサマリー整合性テストに失敗しました' });
  }
});

// 配達順序更新
router.put('/update-delivery-order', (req, res) => {
  const db = getDB();
  const { courseId, customers } = req.body;

  if (!courseId || !customers || !Array.isArray(customers)) {
    res.status(400).json({ error: '無効なリクエストです' });
    return;
  }

  // トランザクション開始
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 各顧客の配達順序を更新
    const updatePromises = customers.map(customer => {
      return new Promise((resolve, reject) => {
        const query = 'UPDATE customers SET delivery_order = ? WHERE id = ? AND course_id = ?';
        db.run(query, [customer.delivery_order, customer.id, courseId], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        });
      });
    });

    Promise.all(updatePromises)
      .then(() => {
        db.run('COMMIT', (err) => {
          if (err) {
            db.run('ROLLBACK');
            res.status(500).json({ error: '配達順序の更新に失敗しました' });
            return;
          }
          res.json({ message: '配達順序を更新しました', updatedCount: customers.length });
        });
      })
      .catch((err) => {
        db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
      });
  });

// ===== 入金削除（履歴から完全削除） =====
router.delete('/:id/payments/:paymentId', async (req, res) => {
  const db = getDB();
  const customerId = req.params.id;
  const paymentId = parseInt(String(req.params.paymentId), 10);
  if (isNaN(paymentId)) {
    db.close();
    return res.status(400).json({ error: 'paymentId が不正です' });
  }
  try {
    console.log('[DELETE payment] customer_id=', customerId, 'payment_id=', paymentId);
    await ensureLedgerTables(db);
    const exists = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM ar_payments WHERE id = ? AND customer_id = ?', [paymentId, customerId], (err, r) => {
        if (err) return reject(err);
        resolve(!!r);
      });
    });
    if (!exists) {
      const byId = await new Promise((resolve, reject) => {
        db.get('SELECT id, customer_id FROM ar_payments WHERE id = ?', [paymentId], (err, r) => {
          if (err) return reject(err);
          resolve(r || null);
        });
      });
      console.warn('[DELETE payment] not found for customer. lookup by id=', paymentId, '->', byId);
      db.close();
      return res.status(404).json({ error: '対象の入金が見つかりません' });
    }
    const deleted = await new Promise((resolve, reject) => {
      db.run('DELETE FROM ar_payments WHERE id = ? AND customer_id = ?', [paymentId, customerId], function(err) {
        if (err) return reject(err);
        resolve(this.changes || 0);
      });
    });
    db.close();
    return res.json({ customer_id: Number(customerId), payment_id: paymentId, deleted_count: deleted });
  } catch (e) {
    db.close();
    return res.status(500).json({ error: e.message });
  }
});

  db.close();
});

module.exports = router;
const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// 操作ログテーブル作成（存在しない場合）
function ensureLogsTable(db) {
  db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_type TEXT NOT NULL,
    description TEXT,
    params_json TEXT,
    data_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

// 増配処理
router.post('/increase-delivery', (req, res) => {
  const { courseId, startDate, endDate, targetDate, aggregate } = req.body;

  if (!courseId || !startDate || !endDate || (aggregate && !targetDate)) {
    return res.status(400).json({ error: 'courseId、startDate、endDate は必須です（aggregate=true の場合は targetDate も必須）' });
  }

  const db = getDB();
  ensureLogsTable(db);
  const opId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdTempChangeIds = [];

  // コース内の顧客を取得
  db.all('SELECT id FROM customers WHERE course_id = ?', [courseId], (err, customers) => {
    if (err) {
      console.error('顧客取得エラー:', err);
      db.close();
      return res.status(500).json({ error: '顧客の取得に失敗しました' });
    }

    if (!customers || customers.length === 0) {
      db.close();
      return res.json({ affectedCustomers: 0, message: '該当する顧客がありません' });
    }

    let processedCount = 0;
    let errorCount = 0;
    const errors = [];

    // 各顧客に対して処理
    const processCustomer = (customerIndex) => {
      if (customerIndex >= customers.length) {
        // ログを保存してから応答
        const params = { courseId, startDate, endDate, targetDate: targetDate || null, aggregate: !!aggregate, opId };
        const data = { tempChangeIds: createdTempChangeIds };
        db.run(
          `INSERT INTO operation_logs (op_type, description, params_json, data_json) VALUES (?, ?, ?, ?)`,
          [
            'increase-delivery',
            aggregate ? '増配処理' : '休配処理',
            JSON.stringify(params),
            JSON.stringify(data)
          ],
          () => {
            db.close();
            return res.json({
              affectedCustomers: processedCount,
              errors: errors.length > 0 ? errors : undefined
            });
          }
        );
        return;
      }

      const customerId = customers[customerIndex].id;

      // 顧客のアクティブな配達パターンを取得
      db.all(
        `SELECT id, product_id, delivery_days, daily_quantities, quantity, unit_price, start_date, end_date
         FROM delivery_patterns
         WHERE customer_id = ? AND is_active = 1
           AND date(start_date) <= date(?) 
           AND date(COALESCE(end_date, '2099-12-31')) >= date(?)`,
        [customerId, endDate, startDate],
        (patternErr, patterns) => {
          if (patternErr) {
            console.error(`顧客ID ${customerId} のパターン取得エラー:`, patternErr);
            errorCount++;
            errors.push(`顧客ID ${customerId}: パターン取得エラー`);
            return processCustomer(customerIndex + 1);
          }

          if (!patterns || patterns.length === 0) {
            return processCustomer(customerIndex + 1);
          }

          // 休業期間内の各日付を処理
          const startDateObj = new Date(startDate);
          const endDateObj = new Date(endDate);
          const holidayDates = [];
          
          for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
            holidayDates.push(new Date(d).toISOString().split('T')[0]);
          }

          // 各パターンに対して増配処理を実行
          let patternProcessed = 0;
          const processPattern = (patternIndex) => {
            if (patternIndex >= patterns.length) {
              if (patternProcessed > 0) {
                processedCount++;
              }
              return processCustomer(customerIndex + 1);
            }

            const pattern = patterns[patternIndex];
            const deliveryDays = JSON.parse(pattern.delivery_days || '[]');
            const dailyQuantities = pattern.daily_quantities ? JSON.parse(pattern.daily_quantities) : null;

          // 休業期間内の配達日を特定し、商品ごとに本数合計を算出
          const deliveriesInHoliday = [];
          const sumByProduct = new Map(); // product_id -> totalQuantity
          holidayDates.forEach(dateStr => {
            const date = new Date(dateStr);
            const dayOfWeek = date.getDay();
            let quantity = 0;
            if (dailyQuantities && dailyQuantities[dayOfWeek] !== undefined) {
              quantity = dailyQuantities[dayOfWeek] || 0;
            } else if (deliveryDays.includes(dayOfWeek)) {
              quantity = pattern.quantity || 0;
            }
            if (quantity > 0) {
              deliveriesInHoliday.push({ date: dateStr, quantity, dayOfWeek });
              const current = sumByProduct.get(pattern.product_id) || 0;
              sumByProduct.set(pattern.product_id, current + quantity);
            }
          });

            if (deliveriesInHoliday.length === 0) {
              return processPattern(patternIndex + 1);
            }

            // 指定日の処理は休業処理とは独立して後でまとめて行うためここではスキップ

            // 指定日の確定チェック（aggregate=false または targetDate 未指定ならスキップ）
            const checkSql = 'SELECT status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?';
            const proceedHolidayChecks = () => {
              // 休配期間の各日付について確定チェック（並列処理）
              let holidayCheckCount = 0;
              let hasHolidayConfirmed = false;
              const holidayCheckComplete = () => {
                holidayCheckCount++;
                if (holidayCheckCount === deliveriesInHoliday.length) {
                  if (hasHolidayConfirmed) {
                    console.warn(`顧客ID ${customerId}, 商品ID ${pattern.product_id}: 休配期間中に確定済みの月が含まれるためスキップ`);
                    errors.push(`顧客ID ${customerId}, 商品ID ${pattern.product_id}: 休配期間中に確定済みの月が含まれるためスキップ`);
                    return processPattern(patternIndex + 1);
                  }
                  // 休配期間中の各配達日をスキップ
                  let skipProcessed = 0;
                  const processSkip = (skipIndex) => {
                    if (skipIndex >= deliveriesInHoliday.length) {
                      // aggregate の場合のみ合計本数を指定日に上書き、それ以外は終了
                      const doAggregate = !!targetDate;
                      if (doAggregate) {
                        const totalForProduct = sumByProduct.get(pattern.product_id) || 0;
                        if (totalForProduct > 0) {
                          db.run(
                            `DELETE FROM temporary_changes WHERE customer_id = ? AND change_date = ? AND product_id = ? AND change_type = 'skip'`,
                            [customerId, targetDate, pattern.product_id],
                            () => {
                              const modifyQuery = `
                                INSERT INTO temporary_changes (
                                  customer_id, change_date, change_type, product_id, 
                                  quantity, unit_price, reason
                                ) VALUES (?, ?, 'modify', ?, ?, ?, ?)
                              `;
                              db.run(
                                modifyQuery,
                                [customerId, targetDate, pattern.product_id, totalForProduct, null, `臨時休業処理[${opId}]（合計本数の前倒し配達）`],
                                function(modifyErr) {
                                  if (modifyErr) {
                                    console.error(`顧客ID ${customerId} の本数変更エラー:`, modifyErr);
                                    errors.push(`顧客ID ${customerId}: 本数変更エラー`);
                                  } else {
                                    patternProcessed++;
                                    if (this && typeof this.lastID === 'number') createdTempChangeIds.push(this.lastID);
                                  }
                                  return processPattern(patternIndex + 1);
                                }
                              );
                            }
                          );
                          return;
                        }
                      }
                      return processPattern(patternIndex + 1);
                    }

                    const holidayDelivery = deliveriesInHoliday[skipIndex];
                    const skipDate = holidayDelivery.date;
                    if (targetDate && skipDate === targetDate) {
                      // 指定日は休配にしない
                      return processSkip(skipIndex + 1);
                    }
                    const skipQuery = `
                      INSERT INTO temporary_changes (
                        customer_id, change_date, change_type, product_id, 
                        quantity, unit_price, reason
                      ) VALUES (?, ?, 'skip', ?, 0, ?, ?)
                    `;
                    db.run(
                      skipQuery,
                      [customerId, skipDate, pattern.product_id, null, `臨時休業処理[${opId}]（休業期間中の休配）`],
                      function(skipErr) {
                        if (skipErr) {
                          console.error(`顧客ID ${customerId} の休配登録エラー:`, skipErr);
                          errors.push(`顧客ID ${customerId}, ${skipDate}: 休配登録エラー`);
                        } else {
                          skipProcessed++;
                          if (this && typeof this.lastID === 'number') createdTempChangeIds.push(this.lastID);
                        }
                        processSkip(skipIndex + 1);
                      }
                    );
                  };

                  processSkip(0);
                }
              };

              // 休配期間の各日付について確定チェック
              if (deliveriesInHoliday.length === 0) {
                holidayCheckComplete();
              } else {
                deliveriesInHoliday.forEach((holidayDelivery) => {
                  const holidayDate = holidayDelivery.date;
                  const holidayY = Number(holidayDate.slice(0, 4));
                  const holidayM = Number(holidayDate.slice(5, 7));
                  
                  db.get(checkSql, [customerId, holidayY, holidayM], (holidayChkErr, holidayInv) => {
                    if (holidayChkErr) {
                      console.error(`顧客ID ${customerId} の休配期間確定チェックエラー:`, holidayChkErr);
                      hasHolidayConfirmed = true;
                    } else if (holidayInv && String(holidayInv.status) === 'confirmed') {
                      hasHolidayConfirmed = true;
                    }
                    holidayCheckComplete();
                  });
                });
              }
            };

            if (!targetDate) {
              // 目標日が無い（増配なし）の場合は直接休配処理へ
              proceedHolidayChecks();
            } else {
              const targetY = Number(targetDate.slice(0, 4));
              const targetM = Number(targetDate.slice(5, 7));
              db.get(checkSql, [customerId, targetY, targetM], (chkErr, inv) => {
                if (chkErr) {
                  console.error(`顧客ID ${customerId} の確定状況チェックエラー:`, chkErr);
                  errors.push(`顧客ID ${customerId}: 確定状況チェックエラー`);
                  return processPattern(patternIndex + 1);
                }
                if (inv && String(inv.status) === 'confirmed') {
                  console.warn(`顧客ID ${customerId}, 商品ID ${pattern.product_id}: ${targetDate}は確定済みのためスキップ`);
                  errors.push(`顧客ID ${customerId}, 商品ID ${pattern.product_id}: ${targetDate}は確定済みのためスキップ`);
                  return processPattern(patternIndex + 1);
                }
                proceedHolidayChecks();
              });
            }
          };

          processPattern(0);
        }
      );
    };

    processCustomer(0);
  });
});

// 増配処理のロールバック
router.post('/increase-delivery/rollback', (req, res) => {
  const db = getDB();

  // 増配処理で作成された臨時変更を削除
  db.run(
    `DELETE FROM temporary_changes 
     WHERE reason LIKE '%増配処理%'`,
    [],
    function(err) {
      if (err) {
        console.error('増配処理のロールバックエラー:', err);
        db.close();
        return res.status(500).json({ error: 'ロールバックに失敗しました' });
      }

      db.close();
      res.json({ 
        message: '増配処理をロールバックしました',
        deletedCount: this.changes
      });
    }
  );
});

// 商品単価一括変更のプレビュー
router.post('/price-change/preview', (req, res) => {
  const { productId, newUnitPrice, startMonth, courseId } = req.body;

  if (!productId || newUnitPrice === undefined || !startMonth) {
    return res.status(400).json({ error: 'productId、newUnitPrice、startMonthは必須です' });
  }

  const db = getDB();
  const startDate = `${startMonth}-01`;
  ensureLogsTable(db);
  const newPatternIds = [];
  const updatedPatterns = [];

  // 対象顧客を取得（コース指定がある場合はフィルタ）
  let customerQuery = `
    SELECT DISTINCT c.id, c.custom_id, c.customer_name
    FROM customers c
    INNER JOIN delivery_patterns dp ON c.id = dp.customer_id
    WHERE dp.product_id = ?
      AND dp.is_active = 1
      AND date(dp.start_date) <= date(?)
      AND date(COALESCE(dp.end_date, '2099-12-31')) >= date(?)
  `;
  
  const queryParams = [productId, startDate, startDate];
  
  if (courseId) {
    customerQuery += ' AND c.course_id = ?';
    queryParams.push(courseId);
  }

  customerQuery += ' ORDER BY c.custom_id';

  db.all(customerQuery, queryParams, (err, customers) => {
    if (err) {
      console.error('プレビュー顧客取得エラー:', err);
      db.close();
      return res.status(500).json({ error: '顧客の取得に失敗しました' });
    }

    db.close();
    res.json({ customers: customers || [] });
  });
});

// 商品単価一括変更
router.post('/price-change', (req, res) => {
  const { productId, newUnitPrice, startMonth, courseId } = req.body;

  if (!productId || newUnitPrice === undefined || !startMonth) {
    return res.status(400).json({ error: 'productId、newUnitPrice、startMonthは必須です' });
  }

  const db = getDB();
  const startDate = `${startMonth}-01`;
  ensureLogsTable(db);
  const newPatternIds = [];
  const updatedPatterns = [];

  // 対象顧客を取得（コース指定がある場合はフィルタ）
  let customerQuery = `
    SELECT DISTINCT c.id
    FROM customers c
    INNER JOIN delivery_patterns dp ON c.id = dp.customer_id
    WHERE dp.product_id = ?
      AND dp.is_active = 1
      AND date(dp.start_date) <= date(?)
      AND date(COALESCE(dp.end_date, '2099-12-31')) >= date(?)
  `;
  
  const queryParams = [productId, startDate, startDate];
  
  if (courseId) {
    customerQuery += ' AND c.course_id = ?';
    queryParams.push(courseId);
  }

  db.all(customerQuery, queryParams, (err, customers) => {
    if (err) {
      console.error('顧客取得エラー:', err);
      db.close();
      return res.status(500).json({ error: '顧客の取得に失敗しました' });
    }

    if (!customers || customers.length === 0) {
      db.close();
      return res.json({ affectedCustomers: 0, message: '該当する顧客がありません' });
    }

    let processedCount = 0;
    let errorCount = 0;
    const errors = [];
    const blockedCustomers = [];

    // 前段チェック：開始月（顧客ごとの実効開始月）が確定済みの顧客が含まれる場合は全体をブロック
    const preCheck = (customerIndex) => {
      if (customerIndex >= customers.length) {
        if (blockedCustomers.length > 0) {
          const blockedCount = blockedCustomers.length;
          db.close();
          return res.status(400).json({
            error: `開始月が確定済みの顧客が含まれるため処理を中止しました（${blockedCount}件）`,
            details: blockedCustomers.slice(0, 50),
          });
        }
        // 問題なければ本処理へ
        return processCustomer(0);
      }

      const customerId = customers[customerIndex].id;
      db.all(
        `SELECT id, product_id, quantity, unit_price, delivery_days, daily_quantities, start_date, end_date
         FROM delivery_patterns
         WHERE customer_id = ? AND product_id = ? AND is_active = 1
           AND date(start_date) <= date(?)
           AND date(COALESCE(end_date, '2099-12-31')) >= date(?)
         ORDER BY start_date DESC
         LIMIT 1`,
        [customerId, productId, startDate, startDate],
        (patternErr, patterns) => {
          if (patternErr) {
            // 取得エラーがあっても処理は継続せず、エラー扱いにして中止するのではなく、後段で個別エラーとして扱うためここではスキップ判定のみ
            return preCheck(customerIndex + 1);
          }
          if (!patterns || patterns.length === 0) {
            return preCheck(customerIndex + 1);
          }
          const pattern = patterns[0];
          const requestedStartDate = `${startMonth}-01`;
          const newStartDate = new Date(
            Math.max(new Date(requestedStartDate).getTime(), new Date(pattern.start_date).getTime())
          );
          const y = Number(newStartDate.toISOString().slice(0, 4));
          const m = Number(newStartDate.toISOString().slice(5, 7));
          const checkSql = 'SELECT status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?';
          db.get(checkSql, [customerId, y, m], (chkErr, inv) => {
            if (!chkErr && inv && String(inv.status) === 'confirmed') {
              blockedCustomers.push({ customerId, year: y, month: m });
            }
            return preCheck(customerIndex + 1);
          });
        }
      );
    };

    // 各顧客に対して処理
    const processCustomer = (customerIndex) => {
      if (customerIndex >= customers.length) {
        // ログを保存してから応答
        const params = { productId, newUnitPrice, startMonth, courseId: courseId || null };
        const data = { newPatternIds, updatedPatterns };
        db.run(
          `INSERT INTO operation_logs (op_type, description, params_json, data_json) VALUES (?, ?, ?, ?)`,
          [
            'price-change',
            '一括単価変更',
            JSON.stringify(params),
            JSON.stringify(data)
          ],
          () => {
            db.close();
            return res.json({
              affectedCustomers: processedCount,
              errors: errors.length > 0 ? errors : undefined
            });
          }
        );
        return;
      }

      const customerId = customers[customerIndex].id;

      // 該当商品のアクティブなパターンを取得
      db.all(
        `SELECT id, product_id, quantity, unit_price, delivery_days, daily_quantities, start_date, end_date
         FROM delivery_patterns
         WHERE customer_id = ? AND product_id = ? AND is_active = 1
           AND date(start_date) <= date(?)
           AND date(COALESCE(end_date, '2099-12-31')) >= date(?)
         ORDER BY start_date DESC
         LIMIT 1`,
        [customerId, productId, startDate, startDate],
        (patternErr, patterns) => {
          if (patternErr) {
            console.error(`顧客ID ${customerId} のパターン取得エラー:`, patternErr);
            errorCount++;
            errors.push(`顧客ID ${customerId}: パターン取得エラー`);
            return processCustomer(customerIndex + 1);
          }

          if (!patterns || patterns.length === 0) {
            return processCustomer(customerIndex + 1);
          }

          const pattern = patterns[0];

          // 新開始日は「指定月1日」と「既存パターン開始日」の遅い方
          const requestedStartDate = `${startMonth}-01`;
          const newStartDate = new Date(
            Math.max(new Date(requestedStartDate).getTime(), new Date(pattern.start_date).getTime())
          );
          const newStartDateStr = newStartDate.toISOString().split('T')[0];

          // 新開始月が確定済みならスキップ（その月のみチェック）
          const y = Number(newStartDateStr.slice(0, 4));
          const m = Number(newStartDateStr.slice(5, 7));
          const checkSql = 'SELECT status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?';
          
          db.get(checkSql, [customerId, y, m], (chkErr, inv) => {
            if (chkErr) {
              console.error(`顧客ID ${customerId} の確定状況チェックエラー:`, chkErr);
              errorCount++;
              errors.push(`顧客ID ${customerId}: 確定状況チェックエラー`);
              return processCustomer(customerIndex + 1);
            }

            if (inv && String(inv.status) === 'confirmed') {
              console.warn(`顧客ID ${customerId}: 開始月が確定済みのためスキップ (${y}-${String(m).padStart(2,'0')})`);
              errors.push(`顧客ID ${customerId}: 開始月が確定済みのためスキップ`);
              return processCustomer(customerIndex + 1);
            }

            // 既存パターンの終了日を新開始日の前日に更新（is_activeは1のまま保持）
            const prevEndDate = new Date(newStartDate);
            prevEndDate.setDate(prevEndDate.getDate() - 1);
            const prevEndDateStr = prevEndDate.toISOString().split('T')[0];

            const updateQuery = `
              UPDATE delivery_patterns 
              SET end_date = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `;

            const prevEndBefore = pattern.end_date || null;
            db.run(updateQuery, [prevEndDateStr, pattern.id], (updateErr) => {
              if (updateErr) {
                console.error(`顧客ID ${customerId} のパターン更新エラー:`, updateErr);
                errorCount++;
                errors.push(`顧客ID ${customerId}: パターン更新エラー`);
                return processCustomer(customerIndex + 1);
              }

              // 新単価の新パターンを新開始日で作成（終了日は無期限: null）
              const deliveryDaysStr = typeof pattern.delivery_days === 'string'
                ? pattern.delivery_days
                : JSON.stringify(pattern.delivery_days || []);
              
              const dailyQuantitiesStr = pattern.daily_quantities
                ? (typeof pattern.daily_quantities === 'string'
                    ? pattern.daily_quantities
                    : JSON.stringify(pattern.daily_quantities))
                : null;

              const insertQuery = `
                INSERT INTO delivery_patterns (
                  customer_id, product_id, quantity, unit_price,
                  delivery_days, daily_quantities, start_date, end_date, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
              `;

              db.run(
                insertQuery,
                [
                  customerId,
                  productId,
                  pattern.quantity,
                  newUnitPrice,
                  deliveryDaysStr,
                  dailyQuantitiesStr,
                  newStartDateStr,
                  null
                ],
                function(insertErr) {
                  if (insertErr) {
                    console.error(`顧客ID ${customerId} のパターン作成エラー:`, insertErr);
                    errorCount++;
                    errors.push(`顧客ID ${customerId}: パターン作成エラー`);
                  } else {
                    processedCount++;
                    if (this && typeof this.lastID === 'number') {
                      newPatternIds.push(this.lastID);
                      updatedPatterns.push({ id: pattern.id, prevEndDate: prevEndBefore });
                    }
                  }
                  processCustomer(customerIndex + 1);
                }
              );
            });
          });
        }
      );
    };

    // まず前段チェックを実施
    preCheck(0);
  });
});

// 商品単価一括変更のロールバック（最近の変更を元に戻す）
router.post('/price-change/rollback', (req, res) => {
  const db = getDB();

  // 過去24時間以内の変更を対象とする（より確実に）
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  db.serialize(() => {
    // 最近更新されたパターンを取得（復元対象）
    // end_dateが設定されているパターンが対象（単価変更でend_dateが設定されたもの）
    db.all(
      `SELECT id, customer_id, product_id, end_date, start_date, updated_at
       FROM delivery_patterns 
       WHERE updated_at >= ?
         AND end_date IS NOT NULL
       ORDER BY updated_at DESC`,
      [twentyFourHoursAgo],
      (err2, inactivePatterns) => {
        if (err2) {
          console.error('非アクティブパターン取得エラー:', err2);
          db.close();
          return res.status(500).json({ error: 'ロールバックに失敗しました' });
        }

        if (!inactivePatterns || inactivePatterns.length === 0) {
          db.close();
          return res.json({
            message: 'ロールバック対象のパターンが見つかりませんでした',
            deletedPatterns: 0,
            restoredPatterns: 0
          });
        }

        let deletedCount = 0;
        let restoredCount = 0;
        const errors = [];

        // 各非アクティブパターンに対して処理
        const processPattern = (index) => {
          if (index >= inactivePatterns.length) {
            db.close();
            return res.json({
              message: '商品単価一括変更をロールバックしました',
              deletedPatterns: deletedCount,
              restoredPatterns: restoredCount,
              errors: errors.length > 0 ? errors : undefined
            });
          }

          const inactivePattern = inactivePatterns[index];
          
          // 同じ顧客・商品で、この非アクティブパターンのend_date+1日から始まる新しいパターンを探す
          const endDate = new Date(inactivePattern.end_date);
          endDate.setDate(endDate.getDate() + 1);
          const nextStartDate = endDate.toISOString().split('T')[0];

          db.all(
            `SELECT id, customer_id, product_id, start_date, created_at
             FROM delivery_patterns 
             WHERE is_active = 1 
               AND customer_id = ?
               AND product_id = ?
               AND start_date = ?
               AND created_at >= ?`,
            [inactivePattern.customer_id, inactivePattern.product_id, nextStartDate, twentyFourHoursAgo],
            (err3, newPatterns) => {
              if (err3) {
                console.error(`パターンID ${inactivePattern.id} の関連パターン取得エラー:`, err3);
                errors.push(`パターンID ${inactivePattern.id}: 関連パターン取得エラー`);
                processPattern(index + 1);
                return;
              }

              // 新しいパターンを削除
              const deleteNewPatterns = (delIndex) => {
                if (delIndex >= (newPatterns || []).length) {
                  // パターンを復元（end_dateをnullに戻す）
                  db.run(
                    `UPDATE delivery_patterns 
                     SET end_date = NULL, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [inactivePattern.id],
                    function(restoreErr) {
                      if (restoreErr) {
                        console.error(`パターンID ${inactivePattern.id} の復元エラー:`, restoreErr);
                        errors.push(`パターンID ${inactivePattern.id}: 復元エラー`);
                      } else {
                        restoredCount++;
                      }
                      processPattern(index + 1);
                    }
                  );
                  return;
                }

                const newPattern = newPatterns[delIndex];
                db.run('DELETE FROM delivery_patterns WHERE id = ?', [newPattern.id], function(deleteErr) {
                  if (deleteErr) {
                    console.error(`パターンID ${newPattern.id} の削除エラー:`, deleteErr);
                    errors.push(`パターンID ${newPattern.id}: 削除エラー`);
                  } else {
                    deletedCount++;
                  }
                  deleteNewPatterns(delIndex + 1);
                });
              };

              deleteNewPatterns(0);
            }
          );
        };

        processPattern(0);
      }
    );
  });
});

// 全体のロールバック（増配処理と単価変更の両方をロールバック）
router.post('/rollback-all', (req, res) => {
  const db = getDB();

  db.serialize(() => {
    // 増配処理のロールバック
    db.run(
      `DELETE FROM temporary_changes 
       WHERE reason LIKE '%増配処理%'`,
      [],
      function(err1) {
        if (err1) {
          console.error('増配処理のロールバックエラー:', err1);
          db.close();
          return res.status(500).json({ error: 'ロールバックに失敗しました' });
        }

        const increaseDeletedCount = this.changes;

        // 単価変更のロールバック（price-change/rollbackと同じロジック）
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        db.all(
          `SELECT id, customer_id, product_id, end_date, start_date, updated_at
           FROM delivery_patterns 
           WHERE updated_at >= ?
             AND end_date IS NOT NULL
           ORDER BY updated_at DESC`,
          [twentyFourHoursAgo],
          (err2, inactivePatterns) => {
            if (err2) {
              console.error('非アクティブパターン取得エラー:', err2);
              db.close();
              return res.status(500).json({ error: 'ロールバックに失敗しました' });
            }

            if (!inactivePatterns || inactivePatterns.length === 0) {
              db.close();
              return res.json({
                message: 'すべての変更をロールバックしました',
                increaseDeliveryDeleted: increaseDeletedCount,
                priceChangeDeleted: 0,
                priceChangeRestored: 0
              });
            }

            let deletedCount = 0;
            let restoredCount = 0;
            const errors = [];

            const processPattern = (index) => {
              if (index >= inactivePatterns.length) {
                db.close();
                return res.json({
                  message: 'すべての変更をロールバックしました',
                  increaseDeliveryDeleted: increaseDeletedCount,
                  priceChangeDeleted: deletedCount,
                  priceChangeRestored: restoredCount,
                  errors: errors.length > 0 ? errors : undefined
                });
              }

              const inactivePattern = inactivePatterns[index];
              const endDate = new Date(inactivePattern.end_date);
              endDate.setDate(endDate.getDate() + 1);
              const nextStartDate = endDate.toISOString().split('T')[0];

              db.all(
                `SELECT id FROM delivery_patterns 
                 WHERE is_active = 1 
                   AND customer_id = ?
                   AND product_id = ?
                   AND start_date = ?
                   AND created_at >= ?`,
                [inactivePattern.customer_id, inactivePattern.product_id, nextStartDate, twentyFourHoursAgo],
                (err3, newPatterns) => {
                  if (err3) {
                    console.error(`パターンID ${inactivePattern.id} の関連パターン取得エラー:`, err3);
                    errors.push(`パターンID ${inactivePattern.id}: 関連パターン取得エラー`);
                    processPattern(index + 1);
                    return;
                  }

                  const deleteNewPatterns = (delIndex) => {
                    if (delIndex >= (newPatterns || []).length) {
                      db.run(
                        `UPDATE delivery_patterns 
                         SET end_date = NULL, updated_at = CURRENT_TIMESTAMP 
                         WHERE id = ?`,
                        [inactivePattern.id],
                        function(restoreErr) {
                          if (restoreErr) {
                            errors.push(`パターンID ${inactivePattern.id}: 復元エラー`);
                          } else {
                            restoredCount++;
                          }
                          processPattern(index + 1);
                        }
                      );
                      return;
                    }

                    db.run('DELETE FROM delivery_patterns WHERE id = ?', [newPatterns[delIndex].id], function(deleteErr) {
                      if (deleteErr) {
                        errors.push(`パターンID ${newPatterns[delIndex].id}: 削除エラー`);
                      } else {
                        deletedCount++;
                      }
                      deleteNewPatterns(delIndex + 1);
                    });
                  };

                  deleteNewPatterns(0);
                }
              );
            };

            processPattern(0);
          }
        );
      }
    );
  });
});

module.exports = router;
 
// 追加: 操作ログ一覧取得
router.get('/logs', (req, res) => {
  const db = getDB();
  ensureLogsTable(db);
  db.all(`SELECT id, op_type, description, params_json, data_json, created_at FROM operation_logs ORDER BY id DESC LIMIT 200`, [], (err, rows) => {
    if (err) {
      db.close();
      return res.status(500).json({ error: err.message });
    }
    db.close();
    res.json(rows || []);
  });
});

// 追加: 操作ログロールバック
router.post('/logs/:id/rollback', (req, res) => {
  const db = getDB();
  ensureLogsTable(db);
  const logId = Number(req.params.id);
  if (!Number.isFinite(logId)) {
    db.close();
    return res.status(400).json({ error: '不正なログIDです' });
  }
  db.get(`SELECT * FROM operation_logs WHERE id = ?`, [logId], (err, row) => {
    if (err) {
      db.close();
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      db.close();
      return res.status(404).json({ error: 'ログが見つかりません' });
    }
    const opType = row.op_type;
    const params = (() => { try { return JSON.parse(row.params_json || '{}'); } catch { return {}; } })();
    const data = (() => { try { return JSON.parse(row.data_json || '{}'); } catch { return {}; } })();

    if (opType === 'increase-delivery') {
      const tempIds = Array.isArray(data.tempChangeIds) ? data.tempChangeIds : [];
      if (tempIds.length > 0) {
        const placeholders = tempIds.map(() => '?').join(',');
        db.run(`DELETE FROM temporary_changes WHERE id IN (${placeholders})`, tempIds, function(dErr) {
          if (dErr) { db.close(); return res.status(500).json({ error: dErr.message }); }
          db.run(`UPDATE operation_logs SET description = description || '（取り消し済）' WHERE id = ? AND description NOT LIKE '%取り消し済%'`, [logId], () => {
            db.close();
            return res.json({ message: '臨時休業処理を取り消しました', deleted: this.changes });
          });
        });
      } else if (params && params.opId) {
        db.run(`DELETE FROM temporary_changes WHERE reason LIKE ?`, [`%[${params.opId}]%`], function(d2) {
          db.run(`UPDATE operation_logs SET description = description || '（取り消し済）' WHERE id = ? AND description NOT LIKE '%取り消し済%'`, [logId], () => {
            db.close();
            return res.json({ message: '臨時休業処理を取り消しました', deleted: this.changes });
          });
        });
      } else {
        db.close();
        return res.status(400).json({ error: 'このログからは復元対象を特定できません' });
      }
    } else if (opType === 'price-change') {
      const newIds = Array.isArray(data.newPatternIds) ? data.newPatternIds : [];
      const updated = Array.isArray(data.updatedPatterns) ? data.updatedPatterns : [];
      let deleted = 0, restored = 0;
      db.serialize(() => {
        if (newIds.length > 0) {
          const placeholders = newIds.map(() => '?').join(',');
          db.run(`DELETE FROM delivery_patterns WHERE id IN (${placeholders})`, newIds, function() { if (this && this.changes) deleted += this.changes; });
        }
        updated.forEach((u) => {
          db.run(`UPDATE delivery_patterns SET end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [u.prevEndDate || null, u.id], function() { if (this && this.changes) restored += this.changes; });
        });
      });
      db.run(`UPDATE operation_logs SET description = description || '（取り消し済）' WHERE id = ? AND description NOT LIKE '%取り消し済%'`, [logId], () => {
        db.close();
        return res.json({ message: '一括単価変更を取り消しました', deletedNew: deleted, restoredOld: restored });
      });
    } else {
      db.close();
      return res.status(400).json({ error: 'このログタイプはロールバックに未対応です' });
    }
  });
});

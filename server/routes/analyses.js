const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');
const moment = require('moment');

// generateMonthlyCalendar関数をコピー（customers.jsから）
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
    const dayOfWeek = date.day();
    const currentDateStr = date.format('YYYY-MM-DD');
    const dayData = {
      date: currentDateStr,
      day: date.date(),
      dayOfWeek,
      products: []
    };
    
    const validPatterns = patterns.filter(pattern => {
      if (pattern.start_date && moment(currentDateStr).isBefore(moment(pattern.start_date))) {
        return false;
      }
      if (pattern.end_date && moment(currentDateStr).isAfter(moment(pattern.end_date))) {
        return false;
      }
      return true;
    });

    const bestPatternByProduct = new Map();
    const currentDate = moment(currentDateStr);
    
    validPatterns.forEach(p => {
      const key = p.product_id;
      const existing = bestPatternByProduct.get(key);
      const pStart = moment(p.start_date);
      const pEnd = p.end_date ? moment(p.end_date) : null;
      const pIsValid = currentDate.isSameOrAfter(pStart, 'day') && 
                       (!pEnd || currentDate.isSameOrBefore(pEnd, 'day'));
      
      if (!existing) {
        if (pIsValid) {
          bestPatternByProduct.set(key, p);
        }
      } else {
        const existingStart = moment(existing.start_date);
        const existingEnd = existing.end_date ? moment(existing.end_date) : null;
        const existingIsValid = currentDate.isSameOrAfter(existingStart, 'day') && 
                                (!existingEnd || currentDate.isSameOrBefore(existingEnd, 'day'));
        
        if (existingIsValid && pStart.isAfter(currentDate, 'day')) {
          return;
        }
        
        if (pIsValid) {
          if (!existingIsValid || pStart.isAfter(existingStart, 'day')) {
            bestPatternByProduct.set(key, p);
          }
        }
      }
    });

    Array.from(bestPatternByProduct.values()).forEach(pattern => {
      let quantity = 0;

      if (pattern.daily_quantities) {
        const dailyQuantities = ensureObject(pattern.daily_quantities);
        quantity = dailyQuantities[dayOfWeek] || 0;
      } else {
        const deliveryDays = ensureArrayDays(pattern.delivery_days || []);
        if (deliveryDays.includes(dayOfWeek)) {
          quantity = pattern.quantity || 0;
        }
      }

      const dayChangesForProduct = temporaryChanges
        .filter(tc => tc.change_date === currentDateStr && tc.product_id === pattern.product_id);

      const hasSkip = dayChangesForProduct.some(tc => tc.change_type === 'skip');
      if (hasSkip) {
        quantity = 0;
      } else {
        const modifyChanges = dayChangesForProduct
          .filter(tc => tc.change_type === 'modify' && tc.quantity !== null && tc.quantity !== undefined)
          .sort((a, b) => {
            const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bd - ad;
          });
        if (modifyChanges.length > 0) {
          const latestModify = modifyChanges[0];
          quantity = Number(latestModify.quantity) || 0;
          if (latestModify.unit_price !== null && latestModify.unit_price !== undefined) {
            pattern.unit_price = latestModify.unit_price;
          }
        }
      }

      if (quantity > 0) {
        dayData.products.push({
          productName: pattern.product_name,
          productId: pattern.product_id,
          quantity: quantity,
          unitPrice: pattern.unit_price,
          purchasePrice: pattern.purchase_price || 0,
          unit: pattern.unit,
          amount: quantity * pattern.unit_price,
          grossProfit: quantity * (pattern.unit_price - (pattern.purchase_price || 0))
        });
      }
    });
    
    temporaryChanges.forEach(tempChange => {
      if (
        tempChange.change_date === currentDateStr &&
        tempChange.change_type === 'add' &&
        tempChange.quantity > 0
      ) {
        const unitPrice = (tempChange.unit_price !== null && tempChange.unit_price !== undefined)
          ? tempChange.unit_price
          : tempChange.product_unit_price;
        const purchasePrice = tempChange.purchase_price || 0;
        dayData.products.push({
          productName: `（臨時）${tempChange.product_name}`,
          productId: tempChange.product_id,
          quantity: tempChange.quantity,
          unitPrice: unitPrice,
          purchasePrice: purchasePrice,
          unit: tempChange.unit,
          amount: tempChange.quantity * unitPrice,
          grossProfit: tempChange.quantity * (unitPrice - purchasePrice)
        });
      }
    });
    
    calendar.push(dayData);
  }
  
  return calendar;
}

// 月次売上・粗利を計算
async function computeMonthlySalesAndProfit(db, year, month) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id FROM customers', [], async (err, customers) => {
      if (err) return reject(err);
      
      let totalSales = 0;
      let totalGrossProfit = 0;
      
      for (const customer of customers) {
        try {
          const patternsQuery = `
            SELECT dp.*, p.product_name, p.unit, p.purchase_price, m.manufacturer_name
            FROM delivery_patterns dp
            JOIN products p ON dp.product_id = p.id
            LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
            WHERE dp.customer_id = ? AND dp.is_active = 1
          `;
          
          const temporaryQuery = `
            SELECT 
              tc.*, 
              p.product_name, 
              p.unit_price AS product_unit_price,
              p.purchase_price,
              p.unit, 
              m.manufacturer_name
            FROM temporary_changes tc
            JOIN products p ON tc.product_id = p.id
            LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
            WHERE tc.customer_id = ?
              AND strftime('%Y', tc.change_date) = ?
              AND strftime('%m', tc.change_date) = ?
          `;
          
          const patterns = await new Promise((res, rej) => {
            db.all(patternsQuery, [customer.id], (pErr, rows) => {
              if (pErr) return rej(pErr);
              res(rows);
            });
          });
          
          const temporaryChanges = await new Promise((res, rej) => {
            db.all(temporaryQuery, [customer.id, String(year), String(month).padStart(2, '0')], (tErr, rows) => {
              if (tErr) return rej(tErr);
              res(rows);
            });
          });
          
          const calendar = generateMonthlyCalendar(year, month, patterns, temporaryChanges);
          const monthSales = calendar.reduce((sum, day) => 
            sum + day.products.reduce((s, p) => s + (p.amount || 0), 0), 0);
          const monthProfit = calendar.reduce((sum, day) => 
            sum + day.products.reduce((s, p) => s + (p.grossProfit || 0), 0), 0);
          
          totalSales += monthSales;
          totalGrossProfit += monthProfit;
        } catch (e) {
          console.error(`顧客 ${customer.id} の計算エラー:`, e);
        }
      }
      
      resolve({ sales: totalSales, grossProfit: totalGrossProfit });
    });
  });
}

// 任意期間の売上・粗利（合計/月ごと）
router.get('/sales', async (req, res) => {
  const db = getDB();
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    db.close();
    return res.status(400).json({ error: 'startDate と endDate を指定してください' });
  }
  
  try {
    const start = moment(startDate);
    const end = moment(endDate);
    const monthlyData = [];
    let totalSales = 0;
    let totalGrossProfit = 0;
    
    const current = start.clone().startOf('month');
    while (current.isSameOrBefore(end, 'month')) {
      const year = current.year();
      const month = current.month() + 1;
      const result = await computeMonthlySalesAndProfit(db, year, month);
      
      monthlyData.push({
        year,
        month,
        sales: result.sales,
        grossProfit: result.grossProfit
      });
      
      totalSales += result.sales;
      totalGrossProfit += result.grossProfit;
      
      current.add(1, 'month');
    }
    
    res.json({
      totalSales,
      totalGrossProfit,
      monthlyData
    });
  } catch (error) {
    console.error('売上データ取得エラー:', error);
    res.status(500).json({ error: error.message });
  } finally {
    db.close();
  }
});

// 商品別の売上・粗利
router.get('/product-sales', async (req, res) => {
  const db = getDB();
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    db.close();
    return res.status(400).json({ error: 'startDate と endDate を指定してください' });
  }
  
  try {
    const start = moment(startDate);
    const end = moment(endDate);
    const productMap = new Map();
    
    const current = start.clone().startOf('month');
    while (current.isSameOrBefore(end, 'month')) {
      const year = current.year();
      const month = current.month() + 1;
      
      const customers = await new Promise((resolve, reject) => {
        db.all('SELECT id FROM customers', [], (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
      
      for (const customer of customers) {
        const patternsQuery = `
          SELECT dp.*, p.product_name, p.id as product_id, p.unit, p.purchase_price
          FROM delivery_patterns dp
          JOIN products p ON dp.product_id = p.id
          WHERE dp.customer_id = ? AND dp.is_active = 1
        `;
        
        const temporaryQuery = `
          SELECT 
            tc.*, 
            p.product_name,
            p.id as product_id,
            p.unit_price AS product_unit_price,
            p.purchase_price,
            p.unit
          FROM temporary_changes tc
          JOIN products p ON tc.product_id = p.id
          WHERE tc.customer_id = ?
            AND strftime('%Y', tc.change_date) = ?
            AND strftime('%m', tc.change_date) = ?
        `;
        
        const patterns = await new Promise((res, rej) => {
          db.all(patternsQuery, [customer.id], (pErr, rows) => {
            if (pErr) return rej(pErr);
            res(rows);
          });
        });
        
        const temporaryChanges = await new Promise((res, rej) => {
          db.all(temporaryQuery, [customer.id, String(year), String(month).padStart(2, '0')], (tErr, rows) => {
            if (tErr) return rej(tErr);
            res(rows);
          });
        });
        
        const calendar = generateMonthlyCalendar(year, month, patterns, temporaryChanges);
        calendar.forEach(day => {
          day.products.forEach(product => {
            const key = product.productId || product.productName;
            if (!productMap.has(key)) {
              productMap.set(key, {
                productId: product.productId || '',
                productName: product.productName.replace(/（臨時）/g, ''),
                sales: 0,
                grossProfit: 0,
                quantity: 0
              });
            }
            const entry = productMap.get(key);
            entry.sales += product.amount || 0;
            entry.grossProfit += product.grossProfit || 0;
            entry.quantity += product.quantity || 0;
          });
        });
      }
      
      current.add(1, 'month');
    }
    
    const result = Array.from(productMap.values()).sort((a, b) => b.sales - a.sales);
    res.json(result);
  } catch (error) {
    console.error('商品別売上データ取得エラー:', error);
    res.status(500).json({ error: error.message });
  } finally {
    db.close();
  }
});

// コース別の売上・粗利
router.get('/course-sales', async (req, res) => {
  const db = getDB();
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    db.close();
    return res.status(400).json({ error: 'startDate と endDate を指定してください' });
  }
  
  try {
    const start = moment(startDate);
    const end = moment(endDate);
    const courseMap = new Map();
    const customerCourseMap = new Map();
    
    // 顧客とコースのマッピングを取得
    const customers = await new Promise((resolve, reject) => {
      db.all(`
        SELECT c.id, c.course_id, dc.course_name
        FROM customers c
        LEFT JOIN delivery_courses dc ON c.course_id = dc.id
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    
    customers.forEach(c => {
      customerCourseMap.set(c.id, { courseId: c.course_id, courseName: c.course_name || '未設定' });
    });
    
    const current = start.clone().startOf('month');
    while (current.isSameOrBefore(end, 'month')) {
      const year = current.year();
      const month = current.month() + 1;
      
      for (const customer of customers) {
        const courseInfo = customerCourseMap.get(customer.id);
        const courseId = courseInfo?.courseId || 0;
        const courseName = courseInfo?.courseName || '未設定';
        
        if (!courseMap.has(courseId)) {
          courseMap.set(courseId, {
            courseId,
            courseName,
            sales: 0,
            grossProfit: 0,
            customerIds: new Set()
          });
        }
        
        const patternsQuery = `
          SELECT dp.*, p.product_name, p.id as product_id, p.unit, p.purchase_price
          FROM delivery_patterns dp
          JOIN products p ON dp.product_id = p.id
          WHERE dp.customer_id = ? AND dp.is_active = 1
        `;
        
        const temporaryQuery = `
          SELECT 
            tc.*, 
            p.product_name,
            p.id as product_id,
            p.unit_price AS product_unit_price,
            p.purchase_price,
            p.unit
          FROM temporary_changes tc
          JOIN products p ON tc.product_id = p.id
          WHERE tc.customer_id = ?
            AND strftime('%Y', tc.change_date) = ?
            AND strftime('%m', tc.change_date) = ?
        `;
        
        const patterns = await new Promise((res, rej) => {
          db.all(patternsQuery, [customer.id], (pErr, rows) => {
            if (pErr) return rej(pErr);
            res(rows);
          });
        });
        
        const temporaryChanges = await new Promise((res, rej) => {
          db.all(temporaryQuery, [customer.id, String(year), String(month).padStart(2, '0')], (tErr, rows) => {
            if (tErr) return rej(tErr);
            res(rows);
          });
        });
        
        const calendar = generateMonthlyCalendar(year, month, patterns, temporaryChanges);
        const monthSales = calendar.reduce((sum, day) => 
          sum + day.products.reduce((s, p) => s + (p.amount || 0), 0), 0);
        const monthProfit = calendar.reduce((sum, day) => 
          sum + day.products.reduce((s, p) => s + (p.grossProfit || 0), 0), 0);
        
        const entry = courseMap.get(courseId);
        entry.sales += monthSales;
        entry.grossProfit += monthProfit;
        entry.customerIds.add(customer.id);
      }
      
      current.add(1, 'month');
    }
    
    const result = Array.from(courseMap.values()).map(course => ({
      courseId: course.courseId,
      courseName: course.courseName,
      sales: course.sales,
      grossProfit: course.grossProfit,
      customerCount: course.customerIds.size
    })).sort((a, b) => b.sales - a.sales);
    
    res.json(result);
  } catch (error) {
    console.error('コース別売上データ取得エラー:', error);
    res.status(500).json({ error: error.message });
  } finally {
    db.close();
  }
});

// 指定月の新規顧客
router.get('/new-customers', async (req, res) => {
  const db = getDB();
  const { month } = req.query;
  
  if (!month) {
    db.close();
    return res.status(400).json({ error: 'month を指定してください（YYYY-MM形式）' });
  }
  
  try {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');
    
    db.all(`
      SELECT 
        c.id,
        c.custom_id,
        c.customer_name,
        c.contract_start_date,
        dc.course_name
      FROM customers c
      LEFT JOIN delivery_courses dc ON c.course_id = dc.id
      WHERE c.contract_start_date >= ? AND c.contract_start_date <= ?
      ORDER BY c.contract_start_date ASC, c.custom_id ASC
    `, [startDate, endDate], (err, rows) => {
      if (err) {
        db.close();
        return res.status(500).json({ error: err.message });
      }
      
      res.json(rows.map(r => ({
        id: r.id,
        customId: r.custom_id,
        customerName: r.customer_name,
        courseName: r.course_name,
        contractStartDate: r.contract_start_date
      })));
      db.close();
    });
  } catch (error) {
    db.close();
    res.status(500).json({ error: error.message });
  }
});

// 指定月の解約客
router.get('/cancelled-customers', async (req, res) => {
  const db = getDB();
  const { month } = req.query;
  
  if (!month) {
    db.close();
    return res.status(400).json({ error: 'month を指定してください（YYYY-MM形式）' });
  }
  
  try {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');
    
    // 解約客は、指定月内にend_dateが設定された配達パターンを持つ顧客
    // かつ、その月以降に新しい有効なパターンがない顧客
    db.all(`
      SELECT DISTINCT
        c.id,
        c.custom_id,
        c.customer_name,
        MAX(dp.end_date) as contract_end_date,
        dc.course_name
      FROM customers c
      LEFT JOIN delivery_courses dc ON c.course_id = dc.id
      INNER JOIN delivery_patterns dp ON c.id = dp.customer_id
      WHERE dp.end_date >= ? AND dp.end_date <= ?
        AND dp.is_active = 1
      GROUP BY c.id
      HAVING NOT EXISTS (
        SELECT 1 FROM delivery_patterns dp2
        WHERE dp2.customer_id = c.id
          AND dp2.is_active = 1
          AND (dp2.end_date IS NULL OR dp2.end_date > ?)
      )
      ORDER BY contract_end_date ASC, c.custom_id ASC
    `, [startDate, endDate, endDate], (err, rows) => {
      if (err) {
        db.close();
        return res.status(500).json({ error: err.message });
      }
      
      res.json(rows.map(r => ({
        id: r.id,
        customId: r.custom_id,
        customerName: r.customer_name,
        courseName: r.course_name,
        contractEndDate: r.contract_end_date
      })));
      db.close();
    });
  } catch (error) {
    db.close();
    res.status(500).json({ error: error.message });
  }
});

// 商品別顧客リスト
router.get('/product-customers', async (req, res) => {
  const db = getDB();
  const { productId } = req.query;
  
  if (!productId) {
    db.close();
    return res.status(400).json({ error: 'productId を指定してください' });
  }
  
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    db.all(`
      SELECT DISTINCT
        c.id as customer_id,
        c.custom_id,
        c.customer_name,
        dc.course_name
      FROM customers c
      LEFT JOIN delivery_courses dc ON c.course_id = dc.id
      INNER JOIN delivery_patterns dp ON c.id = dp.customer_id
      WHERE dp.product_id = ?
        AND dp.is_active = 1
        AND (dp.end_date IS NULL OR dp.end_date >= ?)
        AND (dp.start_date IS NULL OR dp.start_date <= ?)
      ORDER BY dc.course_name ASC, c.custom_id ASC
    `, [productId, `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`, `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(new Date(currentYear, currentMonth, 0).getDate()).padStart(2, '0')}`], async (err, customers) => {
      if (err) {
        db.close();
        return res.status(500).json({ error: err.message });
      }
      
      const results = [];
      for (const customer of customers) {
        const patternsQuery = `
          SELECT dp.*, p.product_name, p.unit, p.purchase_price
          FROM delivery_patterns dp
          JOIN products p ON dp.product_id = p.id
          WHERE dp.customer_id = ? AND dp.product_id = ? AND dp.is_active = 1
        `;
        
        const temporaryQuery = `
          SELECT 
            tc.*, 
            p.product_name,
            p.unit_price AS product_unit_price,
            p.purchase_price,
            p.unit
          FROM temporary_changes tc
          JOIN products p ON tc.product_id = p.id
          WHERE tc.customer_id = ?
            AND tc.product_id = ?
            AND strftime('%Y', tc.change_date) = ?
            AND strftime('%m', tc.change_date) = ?
        `;
        
        const patterns = await new Promise((res, rej) => {
          db.all(patternsQuery, [customer.customer_id, productId], (pErr, rows) => {
            if (pErr) return rej(pErr);
            res(rows);
          });
        });
        
        const temporaryChanges = await new Promise((res, rej) => {
          db.all(temporaryQuery, [customer.customer_id, productId, String(currentYear), String(currentMonth).padStart(2, '0')], (tErr, rows) => {
            if (tErr) return rej(tErr);
            res(rows);
          });
        });
        
        const calendar = generateMonthlyCalendar(currentYear, currentMonth, patterns, temporaryChanges);
        const totalQuantity = calendar.reduce((sum, day) => 
          sum + day.products.filter(p => String(p.productId) === String(productId)).reduce((s, p) => s + (p.quantity || 0), 0), 0);
        const totalAmount = calendar.reduce((sum, day) => 
          sum + day.products.filter(p => String(p.productId) === String(productId)).reduce((s, p) => s + (p.amount || 0), 0), 0);
        
        results.push({
          customerId: customer.customer_id,
          customId: customer.custom_id,
          customerName: customer.customer_name,
          courseName: customer.course_name,
          quantity: totalQuantity,
          totalAmount: totalAmount
        });
      }
      
      res.json(results);
      db.close();
    });
  } catch (error) {
    db.close();
    res.status(500).json({ error: error.message });
  }
});

// 経営指標（月次KPI）
router.get('/kpi', async (req, res) => {
  const db = getDB();
  const { month } = req.query;
  
  if (!month) {
    db.close();
    return res.status(400).json({ error: 'month を指定してください（YYYY-MM形式）' });
  }
  
  try {
    const [year, monthNum] = month.split('-').map(Number);
    const prevMonth = moment(`${year}-${String(monthNum).padStart(2, '0')}-01`).subtract(1, 'month');
    const prevYear = prevMonth.year();
    const prevMonthNum = prevMonth.month() + 1;
    
    // 当月の売上・粗利
    const currentSales = await computeMonthlySalesAndProfit(db, year, monthNum);
    
    // 前月の売上・粗利
    const prevSales = await computeMonthlySalesAndProfit(db, prevYear, prevMonthNum);
    
    // 当月の顧客数（在籍）
    const currentCustomers = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as count
        FROM customers c
        WHERE c.contract_start_date <= ?
          AND NOT EXISTS (
            SELECT 1 FROM delivery_patterns dp
            WHERE dp.customer_id = c.id
              AND dp.is_active = 1
              AND dp.end_date IS NOT NULL
              AND dp.end_date < ?
          )
      `, [`${year}-${String(monthNum).padStart(2, '0')}-${String(new Date(year, monthNum, 0).getDate()).padStart(2, '0')}`, `${year}-${String(monthNum).padStart(2, '0')}-${String(new Date(year, monthNum, 0).getDate()).padStart(2, '0')}`], (err, row) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      });
    });
    
    // 前月の顧客数
    const prevCustomers = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as count
        FROM customers c
        WHERE c.contract_start_date <= ?
          AND NOT EXISTS (
            SELECT 1 FROM delivery_patterns dp
            WHERE dp.customer_id = c.id
              AND dp.is_active = 1
              AND dp.end_date IS NOT NULL
              AND dp.end_date < ?
          )
      `, [`${prevYear}-${String(prevMonthNum).padStart(2, '0')}-${String(new Date(prevYear, prevMonthNum, 0).getDate()).padStart(2, '0')}`, `${prevYear}-${String(prevMonthNum).padStart(2, '0')}-${String(new Date(prevYear, prevMonthNum, 0).getDate()).padStart(2, '0')}`], (err, row) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      });
    });
    
    // 当月の新規顧客数
    const newCustomersCount = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as count
        FROM customers
        WHERE strftime('%Y-%m', contract_start_date) = ?
      `, [month], (err, row) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      });
    });
    
    // 当月の解約客数
    const cancelledCustomersCount = await new Promise((resolve, reject) => {
      const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');
      db.get(`
        SELECT COUNT(DISTINCT c.id) as count
        FROM customers c
        INNER JOIN delivery_patterns dp ON c.id = dp.customer_id
        WHERE dp.end_date >= ? AND dp.end_date <= ?
          AND dp.is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM delivery_patterns dp2
            WHERE dp2.customer_id = c.id
              AND dp2.is_active = 1
              AND (dp2.end_date IS NULL OR dp2.end_date > ?)
          )
      `, [startDate, endDate, endDate], (err, row) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      });
    });
    
    // 計算
    const salesGrowthRate = prevSales.sales > 0 
      ? ((currentSales.sales - prevSales.sales) / prevSales.sales) * 100 
      : 0;
    const grossProfitRate = currentSales.sales > 0 
      ? (currentSales.grossProfit / currentSales.sales) * 100 
      : 0;
    const customerUnitPrice = currentCustomers > 0 
      ? currentSales.sales / currentCustomers 
      : 0;
    const churnRate = prevCustomers > 0 
      ? (cancelledCustomersCount / prevCustomers) * 100 
      : 0;
    
    res.json({
      month,
      sales: currentSales.sales,
      grossProfit: currentSales.grossProfit,
      grossProfitRate,
      customerCount: currentCustomers,
      newCustomersCount,
      cancelledCustomersCount,
      salesGrowthRate,
      customerUnitPrice,
      churnRate
    });
  } catch (error) {
    console.error('KPI取得エラー:', error);
    res.status(500).json({ error: error.message });
  } finally {
    db.close();
  }
});

module.exports = router;


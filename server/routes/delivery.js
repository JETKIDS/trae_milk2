const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// 配達パターン保存
router.post('/patterns', (req, res) => {
  const db = getDB();
  const { customer_id, product_id, delivery_days, quantity, start_date, end_date } = req.body;
  
  const query = `
    INSERT OR REPLACE INTO delivery_patterns 
    (customer_id, product_id, delivery_days, quantity, start_date, end_date, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `;
  
  db.run(query, [customer_id, product_id, JSON.stringify(delivery_days), quantity, start_date, end_date], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: '配達パターンが正常に保存されました' });
  });
  
  db.close();
});

// 日別配達データ取得
router.get('/daily/:date', (req, res) => {
  const db = getDB();
  const { date } = req.params;
  
  // 指定日の配達データを取得するクエリ
  const query = `
    SELECT 
      dp.id,
      dp.customer_id,
      dp.product_id,
      dp.quantity,
      c.customer_name,
      c.address,
      c.phone,
      p.product_name,
      p.unit,
      p.unit_price
    FROM delivery_patterns dp
    JOIN customers c ON dp.customer_id = c.id
    JOIN products p ON dp.product_id = p.id
    WHERE dp.is_active = 1
      AND date(?) BETWEEN date(dp.start_date) AND date(COALESCE(dp.end_date, '2099-12-31'))
      AND json_extract(dp.delivery_days, '$[' || 
          CASE cast(strftime('%w', ?) as integer)
            WHEN 0 THEN 6  -- 日曜日 -> 6
            ELSE cast(strftime('%w', ?) as integer) - 1  -- 月曜日=0, 火曜日=1, ...
          END || ']') = 1
    ORDER BY c.customer_name, p.product_name
  `;
  
  db.all(query, [date, date, date], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // データを顧客ごとにグループ化
    const deliveryData = {};
    let totalQuantity = 0;
    let totalAmount = 0;
    
    rows.forEach(row => {
      if (!deliveryData[row.customer_id]) {
        deliveryData[row.customer_id] = {
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          address: row.address,
          phone: row.phone,
          products: []
        };
      }
      
      deliveryData[row.customer_id].products.push({
        product_id: row.product_id,
        product_name: row.product_name,
        unit: row.unit,
        quantity: row.quantity,
        price: row.unit_price,
        amount: row.quantity * row.unit_price
      });
      
      totalQuantity += row.quantity;
      totalAmount += row.quantity * row.unit_price;
    });
    
    const result = {
      date: date,
      deliveries: Object.values(deliveryData),
      summary: {
        total_customers: Object.keys(deliveryData).length,
        total_quantity: totalQuantity,
        total_amount: totalAmount
      }
    };
    
    res.json(result);
    db.close();
  });
});

// 期間別配達データ取得（コース指定対応）
router.get('/period', (req, res) => {
  const db = getDB();
  const { startDate, endDate, courseId } = req.query;
  
  if (!startDate || !endDate) {
    res.status(400).json({ error: '開始日と終了日を指定してください' });
    return;
  }
  
  console.log('期間別配達データ取得:', { startDate, endDate, courseId });
  
  // ベースクエリ
  let query = `
    SELECT 
      dp.id,
      dp.customer_id,
      dp.product_id,
      dp.delivery_days,
      dp.daily_quantities,
      c.custom_id,
      c.customer_name,
      c.address,
      c.phone,
      c.course_id,
      c.delivery_order,
      dc.course_name,
      p.product_name,
      p.unit,
      dp.unit_price
    FROM delivery_patterns dp
    JOIN customers c ON dp.customer_id = c.id
    JOIN products p ON dp.product_id = p.id
    JOIN delivery_courses dc ON c.course_id = dc.id
    WHERE dp.is_active = 1
      AND dp.start_date <= ?
      AND COALESCE(dp.end_date, '2099-12-31') >= ?
  `;
  
  // パラメータ順序: endDate, startDate
  let params = [endDate, startDate];
  
  // コース指定がある場合
  if (courseId && courseId !== 'all') {
    query += ` AND c.course_id = ?`;
    params.push(courseId);
  }
  
  query += ` ORDER BY dc.course_name, c.delivery_order ASC, c.customer_name, p.product_name`;
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('期間別配達データ取得エラー:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log(`取得した配達パターン数: ${rows.length}`);
    
    // 期間内の各日付について配達データを生成
    const deliveryData = {};
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // 期間内の全日付をループ
    for (let currentDate = new Date(startDateObj); currentDate <= endDateObj; currentDate.setDate(currentDate.getDate() + 1)) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay(); // 0=日曜, 1=月曜, ..., 6=土曜
      
      // 配達パターンをチェック
      rows.forEach(row => {
        try {
          const deliveryDays = JSON.parse(row.delivery_days || '[]');
          let quantity = 0;
          
          // daily_quantitiesがある場合はそれを使用
          if (row.daily_quantities) {
            const dailyQuantities = JSON.parse(row.daily_quantities);
            quantity = dailyQuantities[dayOfWeek] || 0;
          } else {
            // 従来の方式（後方互換性）
            if (deliveryDays.includes(dayOfWeek)) {
              quantity = row.quantity || 0;
            }
          }
          
          if (quantity > 0) {
            // コース別にデータを整理
            if (!deliveryData[row.course_name]) {
              deliveryData[row.course_name] = {};
            }
            
            if (!deliveryData[row.course_name][dateStr]) {
              deliveryData[row.course_name][dateStr] = [];
            }
            
            // 同じ顧客の既存エントリを探す
            let customerEntry = deliveryData[row.course_name][dateStr].find(
              entry => entry.customer_id === row.customer_id
            );
            
            if (!customerEntry) {
              customerEntry = {
                customer_id: row.customer_id,
                custom_id: row.custom_id,
                customer_name: row.customer_name,
                address: row.address,
                phone: row.phone,
                delivery_order: row.delivery_order,
                products: []
              };
              deliveryData[row.course_name][dateStr].push(customerEntry);
            }
            
            customerEntry.products.push({
              product_id: row.product_id,
              product_name: row.product_name,
              unit: row.unit,
              quantity: quantity,
              unit_price: row.unit_price,
              amount: quantity * row.unit_price
            });
          }
        } catch (parseError) {
          console.error('JSON解析エラー:', parseError, 'データ:', row);
        }
      });
    }
    // 配達順序でソート
    Object.keys(deliveryData).forEach(courseName => {
      Object.keys(deliveryData[courseName]).forEach(dateStr => {
        deliveryData[courseName][dateStr].sort((a, b) => {
          return a.delivery_order - b.delivery_order;
        });
      });
    });
    

    
    // 統計情報を計算
    let totalCustomers = 0;
    let totalQuantity = 0;
    let totalAmount = 0;
    
    Object.values(deliveryData).forEach(courseData => {
      Object.values(courseData).forEach(dayData => {
        dayData.forEach(customer => {
          totalCustomers++;
          customer.products.forEach(product => {
            totalQuantity += product.quantity;
            totalAmount += product.amount;
          });
        });
      });
    });
    
    const result = {
      startDate,
      endDate,
      courseId: courseId || 'all',
      deliveries: deliveryData,
      summary: {
        total_customers: totalCustomers,
        total_quantity: totalQuantity,
        total_amount: totalAmount
      }
    };
    
    console.log('期間別配達データ生成完了:', {
      courses: Object.keys(deliveryData).length,
      totalCustomers,
      totalQuantity,
      totalAmount
    });
    
    res.json(result);
  });
  
  db.close();
});

// 期間別商品合計取得（メーカーフィルター対応）
router.get('/products/summary', (req, res) => {
  const db = getDB();
  const { startDate, endDate, courseId, manufacturer } = req.query;
  
  if (!startDate || !endDate) {
    res.status(400).json({ error: '開始日と終了日を指定してください' });
    return;
  }
  
  console.log('期間別商品合計取得:', { startDate, endDate, courseId, manufacturer });
  
  // 基本的な配達パターンデータを取得
  let query = `
    SELECT 
      dp.id,
      p.id as product_id,
      p.product_name,
      p.unit,
      m.manufacturer_name,
      dp.unit_price,
      dp.delivery_days,
      dp.daily_quantities,
      dp.quantity
    FROM delivery_patterns dp
    JOIN customers c ON dp.customer_id = c.id
    JOIN products p ON dp.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE dp.is_active = 1
      AND date(dp.start_date) <= date(?)
      AND date(COALESCE(dp.end_date, '2099-12-31')) >= date(?)
  `;
  
  let params = [endDate, startDate];
  
  // コース指定がある場合
  if (courseId && courseId !== 'all') {
    query += ` AND c.course_id = ?`;
    params.push(courseId);
  }
  
  // メーカー指定がある場合
  if (manufacturer && manufacturer !== 'all') {
    query += ` AND m.id = ?`;
    params.push(manufacturer);
  }
  
  query += ` ORDER BY m.manufacturer_name, p.product_name`;
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('商品合計取得エラー:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log('商品合計データ取得完了:', rows.length, '件');
    
    // 期間別配達リストと同じ計算ロジックを使用
    const productSummary = {};
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // 期間内の各日付をループして正確な数量を計算
    for (let currentDate = new Date(startDateObj); currentDate <= endDateObj; currentDate.setDate(currentDate.getDate() + 1)) {
      const dayOfWeek = currentDate.getDay(); // 0=日曜, 1=月曜, ..., 6=土曜
      
      rows.forEach(row => {
        try {
          const deliveryDays = JSON.parse(row.delivery_days || '[]');
          let quantity = 0;
          
          // daily_quantitiesがある場合はそれを使用
          if (row.daily_quantities) {
            const dailyQuantities = JSON.parse(row.daily_quantities);
            quantity = dailyQuantities[dayOfWeek] || 0;
          } else {
            // 従来の方式（後方互換性）
            if (deliveryDays.includes(dayOfWeek)) {
              quantity = row.quantity || 0;
            }
          }
          
          if (quantity > 0) {
            const key = `${row.product_id}_${row.manufacturer_name}`;
            if (!productSummary[key]) {
              productSummary[key] = {
                product_id: row.product_id,
                product_name: row.product_name,
                unit: row.unit,
                manufacturer_name: row.manufacturer_name,
                total_quantity: 0,
                unit_price: row.unit_price,
                total_amount: 0
              };
            }
            
            productSummary[key].total_quantity += quantity;
            productSummary[key].total_amount += quantity * row.unit_price;
          }
        } catch (parseError) {
          console.error('JSON解析エラー:', parseError, 'データ:', row);
        }
      });
    }
    
    // 商品データを配列に変換
    const products = Object.values(productSummary).filter(product => product.total_quantity > 0);
    
    // 合計を計算
    const totalQuantity = products.reduce((sum, product) => sum + product.total_quantity, 0);
    const totalAmount = products.reduce((sum, product) => sum + product.total_amount, 0);
    
    const result = {
      startDate,
      endDate,
      courseId: courseId || 'all',
      manufacturer: manufacturer || 'all',
      products,
      summary: {
        total_quantity: totalQuantity,
        total_amount: totalAmount,
        product_count: products.length
      }
    };
    
    console.log('商品合計結果:', {
      products: products.length,
      totalQuantity,
      totalAmount
    });
    
    res.json(result);
  });
  
  db.close();
});

// コース別商品合計取得
router.get('/products/summary-by-course', (req, res) => {
  const db = getDB();
  const { startDate, endDate, manufacturer } = req.query;
  
  if (!startDate || !endDate) {
    res.status(400).json({ error: '開始日と終了日を指定してください' });
    return;
  }
  
  console.log('コース別商品合計取得:', { startDate, endDate, manufacturer });
  
  // コース情報を含む配達パターンデータを取得
  let query = `
    SELECT 
      dp.id,
      p.id as product_id,
      p.product_name,
      p.unit,
      m.manufacturer_name,
      dp.unit_price,
      dp.delivery_days,
      dp.daily_quantities,
      dp.quantity,
      c.course_id,
      co.course_name
    FROM delivery_patterns dp
    JOIN customers c ON dp.customer_id = c.id
    JOIN products p ON dp.product_id = p.id
    JOIN manufacturers m ON p.manufacturer_id = m.id
    JOIN delivery_courses co ON c.course_id = co.id
    WHERE dp.is_active = 1
      AND date(dp.start_date) <= date(?)
      AND date(COALESCE(dp.end_date, '2099-12-31')) >= date(?)
  `;
  
  let params = [endDate, startDate];
  
  // メーカー指定がある場合
  if (manufacturer && manufacturer !== 'all') {
    query += ` AND m.id = ?`;
    params.push(manufacturer);
  }
  
  query += ` ORDER BY co.course_name, m.manufacturer_name, p.product_name`;
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('コース別商品合計取得エラー:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    console.log('コース別商品合計データ取得完了:', rows.length, '件');
    
    // コース別に商品合計を計算
    const coursesSummary = {};
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // 期間内の各日付をループして正確な数量を計算
    for (let currentDate = new Date(startDateObj); currentDate <= endDateObj; currentDate.setDate(currentDate.getDate() + 1)) {
      const dayOfWeek = currentDate.getDay(); // 0=日曜, 1=月曜, ..., 6=土曜
      
      rows.forEach(row => {
        try {
          const deliveryDays = JSON.parse(row.delivery_days || '[]');
          let quantity = 0;
          
          // daily_quantitiesがある場合はそれを使用
          if (row.daily_quantities) {
            const dailyQuantities = JSON.parse(row.daily_quantities);
            quantity = dailyQuantities[dayOfWeek] || 0;
          } else {
            // 従来の方式（後方互換性）
            if (deliveryDays.includes(dayOfWeek)) {
              quantity = row.quantity || 0;
            }
          }
          
          if (quantity > 0) {
            const courseId = row.course_id;
            const courseName = row.course_name;
            
            // コースが存在しない場合は初期化
            if (!coursesSummary[courseId]) {
              coursesSummary[courseId] = {
                course_id: courseId,
                course_name: courseName,
                products: {},
                summary: {
                  total_quantity: 0,
                  total_amount: 0,
                  product_count: 0
                }
              };
            }
            
            const productKey = `${row.product_id}_${row.manufacturer_name}`;
            if (!coursesSummary[courseId].products[productKey]) {
              coursesSummary[courseId].products[productKey] = {
                product_id: row.product_id,
                product_name: row.product_name,
                unit: row.unit,
                manufacturer_name: row.manufacturer_name,
                total_quantity: 0,
                unit_price: row.unit_price,
                total_amount: 0
              };
            }
            
            coursesSummary[courseId].products[productKey].total_quantity += quantity;
            coursesSummary[courseId].products[productKey].total_amount += quantity * row.unit_price;
          }
        } catch (parseError) {
          console.error('JSON解析エラー:', parseError, 'データ:', row);
        }
      });
    }
    
    // 各コースの商品データを配列に変換し、合計を計算
    const courses = Object.values(coursesSummary).map(course => {
      const products = Object.values(course.products).filter(product => product.total_quantity > 0);
      const totalQuantity = products.reduce((sum, product) => sum + product.total_quantity, 0);
      const totalAmount = products.reduce((sum, product) => sum + product.total_amount, 0);
      
      return {
        course_id: course.course_id,
        course_name: course.course_name,
        products,
        summary: {
          total_quantity: totalQuantity,
          total_amount: totalAmount,
          product_count: products.length
        }
      };
    }).filter(course => course.products.length > 0);
    
    // 全体の合計を計算
    const overallTotalQuantity = courses.reduce((sum, course) => sum + course.summary.total_quantity, 0);
    const overallTotalAmount = courses.reduce((sum, course) => sum + course.summary.total_amount, 0);
    const overallProductCount = courses.reduce((sum, course) => sum + course.summary.product_count, 0);
    
    const result = {
      startDate,
      endDate,
      manufacturer: manufacturer || 'all',
      courses,
      overall_summary: {
        total_quantity: overallTotalQuantity,
        total_amount: overallTotalAmount,
        product_count: overallProductCount,
        course_count: courses.length
      }
    };
    
    console.log('コース別商品合計結果:', {
      courses: courses.length,
      overallTotalQuantity,
      overallTotalAmount
    });
    
    res.json(result);
  });
  
  db.close();
});

module.exports = router;
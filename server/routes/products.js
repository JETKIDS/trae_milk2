const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// 商品一覧（ページング対応）
router.get('/paged', (req, res) => {
  const db = getDB();
  const { searchId, searchName, sort = 'name', page = '1', pageSize = '50' } = req.query;

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
      whereConditions.push('p.custom_id = ?');
      params.push(paddedId);
    } else {
      whereConditions.push('p.custom_id LIKE ?');
      params.push(`%${idTerm}%`);
    }
  }

  // 商品名で検索
  if (searchName && String(searchName).trim() !== '') {
    whereConditions.push('p.product_name LIKE ?');
    params.push(`%${String(searchName).trim()}%`);
  }

  // 件数カウント
  let countQuery = `SELECT COUNT(*) AS total FROM products p`;
  if (whereConditions.length > 0) {
    countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  // データ取得
  let dataQuery = `
    SELECT p.*, m.manufacturer_name 
    FROM products p
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
  `;
  if (whereConditions.length > 0) {
    dataQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  const sortKey = String(sort).toLowerCase();
  if (sortKey === 'id') {
    dataQuery += ` ORDER BY p.custom_id ASC`;
  } else if (sortKey === 'manufacturer') {
    dataQuery += ` ORDER BY m.manufacturer_name ASC, p.product_name ASC`;
  } else {
    dataQuery += ` ORDER BY p.product_name ASC`;
  }
  dataQuery += ` LIMIT ? OFFSET ?`;

  db.get(countQuery, params, (countErr, countRow) => {
    if (countErr) {
      res.status(500).json({ error: countErr.message });
      db.close();
      return;
    }
    const total = countRow?.total || 0;
    const dataParams = [...params, sizeNum, offset];
    db.all(dataQuery, dataParams, (dataErr, rows) => {
      if (dataErr) {
        res.status(500).json({ error: dataErr.message });
        db.close();
        return;
      }
      res.json({ items: rows || [], total });
      db.close();
    });
  });
});

// 商品一覧取得（複数検索条件対応）
router.get('/', (req, res) => {
  const db = getDB();
  const { searchId, searchName } = req.query;
  
  let query = `
    SELECT p.*, m.manufacturer_name 
    FROM products p
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
  `;
  
  let whereConditions = [];
  let params = [];
  
  // IDで検索
  if (searchId && searchId.trim() !== '') {
    const idTerm = searchId.trim();
    const isNumeric = /^\d+$/.test(idTerm);
    if (isNumeric) {
      const paddedId = idTerm.padStart(4, '0');
      whereConditions.push('p.custom_id = ?');
      params.push(paddedId);
    } else {
      whereConditions.push('p.custom_id LIKE ?');
      params.push(`%${idTerm}%`);
    }
  }
  
  // 商品名で検索
  if (searchName && searchName.trim() !== '') {
    whereConditions.push('p.product_name LIKE ?');
    params.push(`%${searchName.trim()}%`);
  }
  
  // WHERE条件を結合
  if (whereConditions.length > 0) {
    query += ` WHERE ${whereConditions.join(' AND ')}`;
  }
  
  query += ` ORDER BY p.product_name`;
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
  db.close();
});

// 商品詳細取得
router.get('/:id', (req, res) => {
  const db = getDB();
  const productId = req.params.id;
  
  const query = `
    SELECT p.*, m.manufacturer_name 
    FROM products p
    LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
    WHERE p.id = ?
  `;
  
  db.get(query, [productId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: '商品が見つかりません' });
      return;
    }
    res.json(row);
  });
  
  db.close();
});

// 商品登録
router.post('/', async (req, res) => {
  const db = getDB();
  const { 
    custom_id, 
    product_name, 
    product_name_short,
    manufacturer_id, 
    order_code,
    jan_code,
    sort_order,
    sort_type,
    unit_price, 
    purchase_price,
    unit, 
    description,
    include_in_invoice,
    sales_tax_type,
    purchase_tax_type,
    sales_tax_rate,
    purchase_tax_rate,
  } = req.body;
  
  // custom_idが指定されていない場合は自動生成（4桁形式）
  const generateCustomId = () => {
    return new Promise((resolve, reject) => {
      // 数値のみのcustom_idを取得（4桁の0埋め形式）
      const query = `
        SELECT custom_id FROM products 
        WHERE custom_id GLOB '[0-9][0-9][0-9][0-9]' 
        ORDER BY CAST(custom_id AS INTEGER) DESC 
        LIMIT 1
      `;
      db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        const maxId = row ? parseInt(row.custom_id, 10) : 0;
        const nextId = maxId + 1;
        const paddedId = nextId.toString().padStart(4, '0');
        resolve(paddedId);
      });
    });
  };
  
  try {
    const finalCustomId = custom_id || await generateCustomId();
    
    const query = `
      INSERT INTO products (
        custom_id, product_name, product_name_short, manufacturer_id, 
        order_code, jan_code, sort_order, sort_type, unit_price, purchase_price,
        unit, description, include_in_invoice, sales_tax_type, purchase_tax_type,
        sales_tax_rate, purchase_tax_rate
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [
      finalCustomId, product_name, product_name_short, manufacturer_id,
      order_code, jan_code, sort_order || 0, sort_type || 'id', unit_price, purchase_price || 0,
      unit || '本', description, include_in_invoice ? 1 : 0, sales_tax_type || 'inclusive', purchase_tax_type || 'reduced',
      typeof sales_tax_rate === 'number' ? sales_tax_rate : null,
      typeof purchase_tax_rate === 'number' ? purchase_tax_rate : null,
    ], function(err) {
      if (err) {
        console.error('❌ 商品登録エラー:', err.message);
        console.error('📦 リクエストデータ:', req.body);
        if (err.message.includes('UNIQUE constraint failed')) {
          db.close();
          res.status(400).json({ error: 'このIDは既に使用されています' });
        } else {
          db.close();
          res.status(500).json({ error: err.message });
        }
        return;
      }
      db.close();
      res.json({ id: this.lastID, custom_id: finalCustomId, message: '商品が正常に登録されました' });
    });
  } catch (error) {
    console.error('❌ 商品登録例外エラー:', error.message);
    console.error('📦 リクエストデータ:', req.body);
    db.close();
    res.status(500).json({ error: error.message });
  }
});

// 商品更新
router.put('/:id', (req, res) => {
  const db = getDB();
  const productId = req.params.id;
  const { 
    custom_id, 
    product_name, 
    product_name_short,
    manufacturer_id, 
    order_code,
    jan_code,
    sort_order,
    sort_type,
    unit_price, 
    purchase_price,
    unit, 
    description,
    include_in_invoice,
    sales_tax_type,
    purchase_tax_type,
    sales_tax_rate,
    purchase_tax_rate,
  } = req.body;
  
  const query = `
    UPDATE products 
    SET custom_id = ?, product_name = ?, product_name_short = ?, manufacturer_id = ?, 
        order_code = ?, jan_code = ?, sort_order = ?, sort_type = ?, unit_price = ?, purchase_price = ?,
        unit = ?, description = ?, include_in_invoice = ?, sales_tax_type = ?, purchase_tax_type = ?,
        sales_tax_rate = ?, purchase_tax_rate = ?
    WHERE id = ?
  `;
  
  db.run(query, [
    custom_id, product_name, product_name_short, manufacturer_id,
    order_code, jan_code, sort_order || 0, sort_type || 'id', unit_price, purchase_price || 0,
    unit || '本', description, include_in_invoice ? 1 : 0, sales_tax_type || 'inclusive', purchase_tax_type || 'reduced',
    typeof sales_tax_rate === 'number' ? sales_tax_rate : null,
    typeof purchase_tax_rate === 'number' ? purchase_tax_rate : null,
    productId
  ], function(err) {
    if (err) {
      console.error('❌ 商品更新エラー:', err.message);
      console.error('📦 リクエストデータ:', req.body);
      if (err.message.includes('UNIQUE constraint failed')) {
        db.close();
        res.status(400).json({ error: 'このIDは既に使用されています' });
      } else {
        db.close();
        res.status(500).json({ error: err.message });
      }
      return;
    }
    db.close();
    res.json({ message: '商品情報が正常に更新されました' });
  });
});

// 商品削除
router.delete('/:id', (req, res) => {
  const db = getDB();
  const productId = req.params.id;

  // 依存関係チェック：契約（配達パターン）や臨時変更で使用されている場合は削除不可
  db.serialize(() => {
    db.get('SELECT COUNT(*) AS cnt FROM delivery_patterns WHERE product_id = ? AND is_active = 1', [productId], (err1, row1) => {
      if (err1) {
        res.status(500).json({ error: err1.message });
        db.close();
        return;
      }
      db.get('SELECT COUNT(*) AS cnt FROM temporary_changes WHERE product_id = ?', [productId], (err2, row2) => {
        if (err2) {
          res.status(500).json({ error: err2.message });
          db.close();
          return;
        }
        const refCount = (row1?.cnt || 0) + (row2?.cnt || 0);
        if (refCount > 0) {
          res.status(409).json({ error: 'この商品は顧客の契約や臨時変更で使用されているため削除できません' });
          db.close();
          return;
        }
        // 依存なしのため削除実行
        const query = `DELETE FROM products WHERE id = ?`;
        db.run(query, [productId], function(errDel) {
          if (errDel) {
            res.status(500).json({ error: errDel.message });
            db.close();
            return;
          }
          if (this.changes === 0) {
            res.status(404).json({ error: '商品が見つかりません' });
            db.close();
            return;
          }
          res.json({ message: '商品が正常に削除されました' });
          db.close();
        });
      });
    });
  });
});

module.exports = router;
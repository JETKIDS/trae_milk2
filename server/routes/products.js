const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

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
  const { custom_id, product_name, manufacturer_id, unit_price, unit, description } = req.body;
  
  // custom_idが指定されていない場合は自動生成（4桁形式）
  const generateCustomId = () => {
    return new Promise((resolve, reject) => {
      const query = 'SELECT MAX(CAST(custom_id AS INTEGER)) as max_id FROM products WHERE custom_id REGEXP "^[0-9]+$"';
      db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        const nextId = (row.max_id || 0) + 1;
        const paddedId = nextId.toString().padStart(4, '0');
        resolve(paddedId);
      });
    });
  };
  
  try {
    const finalCustomId = custom_id || await generateCustomId();
    
    const query = `
      INSERT INTO products (custom_id, product_name, manufacturer_id, unit_price, unit, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [finalCustomId, product_name, manufacturer_id, unit_price, unit, description], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          res.status(400).json({ error: 'このIDは既に使用されています' });
        } else {
          res.status(500).json({ error: err.message });
        }
        return;
      }
      res.json({ id: this.lastID, custom_id: finalCustomId, message: '商品が正常に登録されました' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
  
  db.close();
});

// 商品更新
router.put('/:id', (req, res) => {
  const db = getDB();
  const productId = req.params.id;
  const { custom_id, product_name, manufacturer_id, unit_price, unit, description } = req.body;
  
  const query = `
    UPDATE products 
    SET custom_id = ?, product_name = ?, manufacturer_id = ?, unit_price = ?, unit = ?, description = ?
    WHERE id = ?
  `;
  
  db.run(query, [custom_id, product_name, manufacturer_id, unit_price, unit, description, productId], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'このIDは既に使用されています' });
      } else {
        res.status(500).json({ error: err.message });
      }
      return;
    }
    res.json({ message: '商品情報が正常に更新されました' });
  });
  
  db.close();
});

// 商品削除
router.delete('/:id', (req, res) => {
  const db = getDB();
  const productId = req.params.id;
  
  const query = `DELETE FROM products WHERE id = ?`;
  
  db.run(query, [productId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: '商品が見つかりません' });
      return;
    }
    res.json({ message: '商品が正常に削除されました' });
  });
  
  db.close();
});

module.exports = router;
const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// 配達コース一覧取得
router.get('/courses', (req, res) => {
  const db = getDB();
  db.all('SELECT * FROM delivery_courses ORDER BY course_name', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
  db.close();
});

// 配達コース詳細取得
router.get('/courses/:id', (req, res) => {
  const db = getDB();
  const courseId = req.params.id;
  
  db.get('SELECT * FROM delivery_courses WHERE id = ?', [courseId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'コースが見つかりません' });
      return;
    }
    res.json(row);
  });
  
  db.close();
});

// 配達コース登録
router.post('/courses', (req, res) => {
  const db = getDB();
  const { custom_id, course_name, description } = req.body;
  
  // custom_idが指定されていない場合は自動生成
  const generateCustomId = () => {
    const timestamp = Date.now().toString().slice(-6);
    return `COURSE-${timestamp}`;
  };
  
  const finalCustomId = custom_id || generateCustomId();
  
  const query = `
    INSERT INTO delivery_courses (custom_id, course_name, description)
    VALUES (?, ?, ?)
  `;
  
  db.run(query, [finalCustomId, course_name, description], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'このIDは既に使用されています' });
      } else {
        res.status(500).json({ error: err.message });
      }
      return;
    }
    res.json({ id: this.lastID, custom_id: finalCustomId, message: 'コースが正常に登録されました' });
  });
  
  db.close();
});

// 配達コース更新
router.put('/courses/:id', (req, res) => {
  const db = getDB();
  const courseId = req.params.id;
  const { custom_id, course_name, description } = req.body;
  
  const query = `
    UPDATE delivery_courses 
    SET custom_id = ?, course_name = ?, description = ?
    WHERE id = ?
  `;
  
  db.run(query, [custom_id, course_name, description, courseId], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'このIDは既に使用されています' });
      } else {
        res.status(500).json({ error: err.message });
      }
      return;
    }
    res.json({ message: 'コース情報が正常に更新されました' });
  });
  
  db.close();
});

// 配達コース削除
router.delete('/courses/:id', (req, res) => {
  const db = getDB();
  const courseId = req.params.id;
  
  const query = `DELETE FROM delivery_courses WHERE id = ?`;
  
  db.run(query, [courseId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'コースが見つかりません' });
      return;
    }
    res.json({ message: 'コースが正常に削除されました' });
  });
  
  db.close();
});

// 配達スタッフ一覧取得
router.get('/staff', (req, res) => {
  const db = getDB();
  const query = `
    SELECT ds.*, dc.course_name 
    FROM delivery_staff ds
    LEFT JOIN delivery_courses dc ON ds.course_id = dc.id
    ORDER BY ds.staff_name
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
  db.close();
});

// メーカー一覧取得
router.get('/manufacturers', (req, res) => {
  const db = getDB();
  db.all('SELECT * FROM manufacturers ORDER BY manufacturer_name', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
  db.close();
});

module.exports = router;
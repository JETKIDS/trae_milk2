const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// 配達コース一覧取得
router.get('/', (req, res) => {
  const db = getDB();
  db.all('SELECT * FROM delivery_courses ORDER BY custom_id ASC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
  db.close();
});

// 配達コース詳細取得
router.get('/:id', (req, res) => {
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
router.post('/', (req, res) => {
  const db = getDB();
  const { custom_id, course_name, description } = req.body;

  const insertWithId = (idToUse) => {
    const query = `
      INSERT INTO delivery_courses (custom_id, course_name, description)
      VALUES (?, ?, ?)
    `;
    db.run(query, [idToUse, course_name, description], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          res.status(400).json({ error: 'このIDは既に使用されています' });
        } else {
          res.status(500).json({ error: err.message });
        }
        return;
      }
      res.json({ id: this.lastID, custom_id: idToUse, message: 'コースが正常に登録されました' });
    });
  };

  if (custom_id) {
    insertWithId(custom_id);
    db.close();
    return;
  }

  // custom_idが指定されていない場合は、未使用の最小3桁ID（001〜999）を割り当て
  db.all('SELECT custom_id FROM delivery_courses', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }

    const used = new Set(
      (rows || [])
        .map(r => r.custom_id)
        .filter(id => typeof id === 'string' && /^\d{3}$/.test(id))
    );
    let candidate = null;
    for (let n = 1; n <= 999; n++) {
      const cand = String(n).padStart(3, '0');
      if (!used.has(cand)) { candidate = cand; break; }
    }

    if (!candidate) {
      res.status(400).json({ error: '利用可能な3桁IDがありません（001〜999が全て使用済み）' });
      db.close();
      return;
    }

    insertWithId(candidate);
    db.close();
  });
});

// 配達コース更新
router.put('/:id', (req, res) => {
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
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'コースが見つかりません' });
      return;
    }
    res.json({ message: 'コースが正常に更新されました' });
  });
  
  db.close();
});

// 配達コース削除
router.delete('/:id', (req, res) => {
  const db = getDB();
  const courseId = req.params.id;

  // 顧客がこのコースを使用していないかチェック
  db.get('SELECT COUNT(*) as count FROM customers WHERE course_id = ?', [courseId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    
    if (row.count > 0) {
      res.status(400).json({ error: 'このコースを使用している顧客がいるため削除できません' });
      db.close();
      return;
    }

    db.run('DELETE FROM delivery_courses WHERE id = ?', [courseId], function(err) {
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
});

module.exports = router;

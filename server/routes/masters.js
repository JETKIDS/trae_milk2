const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// スタッフとコースの多対多対応テーブルを必要に応じて作成
function ensureStaffCoursesTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS staff_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      UNIQUE(staff_id, course_id)
    )
  `);
}

// 配達コース一覧取得
router.get('/courses', (req, res) => {
  const db = getDB();
  // ID順で表示するため custom_id 昇順に並べ替え（3桁固定のため文字列昇順でOK）
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
    // クライアント指定のIDをそのまま使用（ユニーク制約に任せる）
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

// 既存配達コースのIDを001〜Nにリナンバリング
router.post('/courses/renumber', (req, res) => {
  const db = getDB();
  db.serialize(() => {
    db.all('SELECT id FROM delivery_courses ORDER BY id', [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        db.close();
        return;
      }
      if (!rows || rows.length === 0) {
        res.json({ message: 'コースが存在しません', updated: 0 });
        db.close();
        return;
      }

      // 衝突回避のため一旦一時IDに更新
      db.run('BEGIN TRANSACTION');
      let phaseError = null;

      rows.forEach((row, index) => {
        const tmpId = `TMP-${String(index + 1).padStart(3, '0')}`;
        db.run('UPDATE delivery_courses SET custom_id = ? WHERE id = ?', [tmpId, row.id], (err2) => {
          if (err2 && !phaseError) phaseError = err2;
        });
      });

      db.run('COMMIT', (commitErr) => {
        if (phaseError || commitErr) {
          res.status(500).json({ error: (phaseError || commitErr).message });
          db.close();
          return;
        }

        // 最終IDに更新
        db.run('BEGIN TRANSACTION');
        let finalError = null;
        rows.forEach((row, index) => {
          const finalId = String(index + 1).padStart(3, '0');
          db.run('UPDATE delivery_courses SET custom_id = ? WHERE id = ?', [finalId, row.id], (err3) => {
            if (err3 && !finalError) finalError = err3;
          });
        });
        db.run('COMMIT', (commitErr2) => {
          if (finalError || commitErr2) {
            res.status(500).json({ error: (finalError || commitErr2).message });
          } else {
            res.json({ message: 'コースIDを001〜Nにリナンバリングしました', updated: rows.length });
          }
          db.close();
        });
      });
    });
  });
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
  // 依存関係チェック（顧客がこのコースに紐づく場合は削除不可）
  db.get('SELECT COUNT(*) AS cnt FROM customers WHERE course_id = ?', [courseId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    if ((row?.cnt || 0) > 0) {
      res.status(409).json({ error: 'このコースは顧客に割り当てられているため削除できません' });
      db.close();
      return;
    }
    // 関連付けクリーンアップ後に削除
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      let txnError = null;
      // staff_courses の関連削除
      db.run('DELETE FROM staff_courses WHERE course_id = ?', [courseId], (e1) => { if (e1 && !txnError) txnError = e1; });
      // delivery_staff の単一割り当てをクリア
      db.run('UPDATE delivery_staff SET course_id = NULL WHERE course_id = ?', [courseId], (e2) => { if (e2 && !txnError) txnError = e2; });
      // コース本体削除
      db.run('DELETE FROM delivery_courses WHERE id = ?', [courseId], function(e3) {
        if (e3 && !txnError) txnError = e3;
        if (!e3 && this.changes === 0 && !txnError) {
          txnError = new Error('コースが見つかりません');
        }
      });
      db.run('COMMIT', (commitErr) => {
        if (txnError || commitErr) {
          const message = (txnError || commitErr).message;
          const status = message === 'コースが見つかりません' ? 404 : 500;
          res.status(status).json({ error: message });
        } else {
          res.json({ message: 'コースが正常に削除されました' });
        }
        db.close();
      });
    });
  });
});

// 配達スタッフ一覧取得
router.get('/staff', (req, res) => {
  const db = getDB();
  ensureStaffCoursesTable(db);
  // 各スタッフに紐づくすべての担当コース名をサブクエリで集約して返す（DISTINCT対応）
  const query = `
    SELECT 
      ds.id,
      ds.staff_name,
      ds.phone,
      ds.email,
      ds.course_id,
      ds_dc.course_name AS course_name,
      (
        SELECT GROUP_CONCAT(course_name, '、')
        FROM (
          SELECT DISTINCT dc2.course_name
          FROM staff_courses sc2
          LEFT JOIN delivery_courses dc2 ON sc2.course_id = dc2.id
          WHERE sc2.staff_id = ds.id AND dc2.course_name IS NOT NULL
          ORDER BY dc2.course_name
        )
      ) AS all_course_names
    FROM delivery_staff ds
    LEFT JOIN delivery_courses ds_dc ON ds.course_id = ds_dc.id
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

// 配達スタッフ作成
router.post('/staff', (req, res) => {
  const db = getDB();
  const { staff_name, phone, email, course_id } = req.body;

  if (!staff_name) {
    res.status(400).json({ error: 'スタッフ名は必須です' });
    db.close();
    return;
  }

  const query = `
    INSERT INTO delivery_staff (staff_name, phone, email, course_id)
    VALUES (?, ?, ?, ?)
  `;

  db.run(query, [staff_name, phone || null, email || null, course_id || null], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'スタッフが作成されました' });
  });

  db.close();
});

// 配達スタッフ更新（担当コースの割り当てなど）
router.put('/staff/:id', (req, res) => {
  const db = getDB();
  const staffId = req.params.id;
  const { staff_name, phone, email, course_id } = req.body;

  const query = `
    UPDATE delivery_staff
    SET staff_name = COALESCE(?, staff_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        course_id = COALESCE(?, course_id)
    WHERE id = ?
  `;

  db.run(query, [staff_name || null, phone || null, email || null, course_id ?? null, staffId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'スタッフが見つかりません' });
      return;
    }
    res.json({ message: 'スタッフ情報が正常に更新されました' });
  });

  db.close();
});

// 配達スタッフ削除
router.delete('/staff/:id', (req, res) => {
  const db = getDB();
  const staffId = req.params.id;
  // 依存関係チェック（顧客がこのスタッフに紐づく場合は削除不可）
  db.get('SELECT COUNT(*) AS cnt FROM customers WHERE staff_id = ?', [staffId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    if ((row?.cnt || 0) > 0) {
      res.status(409).json({ error: 'このスタッフは顧客に割り当てられているため削除できません' });
      db.close();
      return;
    }
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      let txnError = null;
      db.run('DELETE FROM staff_courses WHERE staff_id = ?', [staffId], (e1) => { if (e1 && !txnError) txnError = e1; });
      db.run('DELETE FROM delivery_staff WHERE id = ?', [staffId], function(e2) {
        if (e2 && !txnError) txnError = e2;
        if (!e2 && this.changes === 0 && !txnError) txnError = new Error('スタッフが見つかりません');
      });
      db.run('COMMIT', (commitErr) => {
        if (txnError || commitErr) {
          const message = (txnError || commitErr).message;
          const status = message === 'スタッフが見つかりません' ? 404 : 500;
          res.status(status).json({ error: message });
        } else {
          res.json({ message: 'スタッフが正常に削除されました' });
        }
        db.close();
      });
    });
  });
});

// スタッフにコースを追加割り当て（複数コース対応）
router.post('/staff/:id/courses', (req, res) => {
  const db = getDB();
  ensureStaffCoursesTable(db);
  const staffId = parseInt(req.params.id, 10);
  const { course_id } = req.body;
  if (!staffId || !course_id) {
    res.status(400).json({ error: 'staff_id と course_id は必須です' });
    db.close();
    return;
  }
  const query = `INSERT OR IGNORE INTO staff_courses (staff_id, course_id) VALUES (?, ?)`;
  db.run(query, [staffId, course_id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    res.json({ message: '担当コースを追加しました' });
    db.close();
  });
});

// スタッフからコースの割り当て削除
router.delete('/staff/:id/courses/:courseId', (req, res) => {
  const db = getDB();
  ensureStaffCoursesTable(db);
  const staffId = parseInt(req.params.id, 10);
  const courseId = parseInt(req.params.courseId, 10);
  if (!staffId || !courseId) {
    res.status(400).json({ error: 'staff_id と course_id は必須です' });
    db.close();
    return;
  }
  const query = `DELETE FROM staff_courses WHERE staff_id = ? AND course_id = ?`;
  db.run(query, [staffId, courseId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    res.json({ message: '担当コースの割り当てを削除しました' });
    db.close();
  });
});

// コースの担当者（単一）を設定：既存割り当てをクリアしてから指定スタッフを割り当て
router.post('/courses/:id/staff-assign', (req, res) => {
  const db = getDB();
  ensureStaffCoursesTable(db);
  const courseId = parseInt(req.params.id, 10);
  const { staff_id } = req.body; // null/undefined の場合は担当者クリア
  if (!courseId) {
    res.status(400).json({ error: 'course_id が不正です' });
    db.close();
    return;
  }
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    let txnError = null;
    db.run('DELETE FROM staff_courses WHERE course_id = ?', [courseId], (err) => {
      if (err && !txnError) txnError = err;
    });
    if (staff_id) {
      db.run('INSERT INTO staff_courses (staff_id, course_id) VALUES (?, ?)', [staff_id, courseId], (err) => {
        if (err && !txnError) txnError = err;
      });
    }
    db.run('COMMIT', (commitErr) => {
      if (txnError || commitErr) {
        res.status(500).json({ error: (txnError || commitErr).message });
      } else {
        res.json({ message: staff_id ? '担当者を設定しました' : '担当者をクリアしました' });
      }
      db.close();
    });
  });
});

// コースの現在の担当者取得（単一）
router.get('/courses/:id/assigned-staff', (req, res) => {
  const db = getDB();
  ensureStaffCoursesTable(db);
  const courseId = parseInt(req.params.id, 10);
  const query = `
    SELECT ds.id AS staff_id, ds.staff_name
    FROM staff_courses sc
    LEFT JOIN delivery_staff ds ON ds.id = sc.staff_id
    WHERE sc.course_id = ?
    LIMIT 1
  `;
  db.get(query, [courseId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    res.json(row || null);
    db.close();
  });
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

// メーカー削除
router.delete('/manufacturers/:id', (req, res) => {
  const db = getDB();
  const manufacturerId = req.params.id;
  // 依存関係チェック（商品がこのメーカーに紐づく場合は削除不可）
  db.get('SELECT COUNT(*) AS cnt FROM products WHERE manufacturer_id = ?', [manufacturerId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      db.close();
      return;
    }
    if ((row?.cnt || 0) > 0) {
      res.status(409).json({ error: 'このメーカーに紐づく商品が存在するため削除できません' });
      db.close();
      return;
    }
    const query = `DELETE FROM manufacturers WHERE id = ?`;
    db.run(query, [manufacturerId], function(delErr) {
      if (delErr) {
        res.status(500).json({ error: delErr.message });
        db.close();
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'メーカーが見つかりません' });
        db.close();
        return;
      }
      res.json({ message: 'メーカーが正常に削除されました' });
      db.close();
    });
  });
});

// 会社情報取得
router.get('/company', (req, res) => {
  const db = getDB();
  db.get('SELECT * FROM company_info WHERE id = 1', [], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      // 会社情報が存在しない場合はデフォルト値を返す
      const defaultCompanyInfo = {
        id: 1,
        company_name: '',
        postal_code: '',
        address: '',
        phone: '',
        fax: '',
        email: '',
        representative: '',
        business_hours: '',
        established_date: '',
        capital: '',
        business_description: ''
      };
      res.json(defaultCompanyInfo);
      return;
    }
    res.json(row);
  });
  db.close();
});

// 会社情報更新・作成
router.post('/company', (req, res) => {
  const db = getDB();
  const {
    company_name,
    postal_code,
    address,
    phone,
    fax,
    email,
    representative,
    business_hours,
    established_date
  } = req.body;

  // まず既存のレコードがあるかチェック
  db.get('SELECT id FROM company_info WHERE id = 1', [], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (row) {
      // 更新
      const updateQuery = `
        UPDATE company_info 
        SET company_name = ?, postal_code = ?, address = ?, phone = ?, fax = ?, 
            email = ?, representative = ?, business_hours = ?, established_date = ?, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `;
      
      db.run(updateQuery, [
        company_name, postal_code, address, phone, fax, email, 
        representative, business_hours, established_date
      ], function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ message: '会社情報が正常に更新されました' });
      });
    } else {
      // 新規作成
      const insertQuery = `
        INSERT INTO company_info (
          id, company_name, postal_code, address, phone, fax, email, 
          representative, business_hours, established_date
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(insertQuery, [
        company_name, postal_code, address, phone, fax, email, 
        representative, business_hours, established_date
      ], function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ message: '会社情報が正常に作成されました' });
      });
    }
  });
  
  db.close();
});

module.exports = router;
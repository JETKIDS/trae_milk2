const express = require('express');
const router = express.Router();
const { getDB } = require('../connection');

// スキーマ保証
(function ensureTasksTable() {
  const db = getDB();
  const ddl = `
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('daily','monthly')),
      title TEXT NOT NULL,
      note TEXT,
      date TEXT,
      month TEXT,
      due_time TEXT,
      completed INTEGER DEFAULT 0,
      order_index INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_daily ON tasks(type, date);
    CREATE INDEX IF NOT EXISTS idx_tasks_monthly ON tasks(type, month);
  `;
  db.exec(ddl, (err) => {
    try { db.close(); } catch {}
    if (err) {
      console.warn('tasks テーブル初期化エラー:', err && err.message);
    }
  });
})();

function nowIso() {
  return new Date().toISOString();
}

function isValidType(type) {
  return type === 'daily' || type === 'monthly';
}

router.get('/', (req, res) => {
  const db = getDB();
  const { type, date, month } = req.query;
  if (!isValidType(type)) {
    return res.status(400).json({ error: 'type は daily または monthly を指定してください' });
  }
  let sql = '';
  let params = [];
  if (type === 'daily') {
    if (!date) {
      return res.status(400).json({ error: 'date を指定してください（YYYY-MM-DD）' });
    }
    sql = `SELECT * FROM tasks WHERE type = 'daily' AND date = ? ORDER BY COALESCE(order_index, created_at) ASC, id ASC`;
    params = [date];
  } else {
    if (!month) {
      return res.status(400).json({ error: 'month を指定してください（YYYY-MM）' });
    }
    sql = `SELECT * FROM tasks WHERE type = 'monthly' AND month = ? ORDER BY COALESCE(order_index, created_at) ASC, id ASC`;
    params = [month];
  }
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      note: r.note || '',
      date: r.date || null,
      month: r.month || null,
      dueTime: r.due_time || null,
      completed: !!r.completed,
      orderIndex: r.order_index,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  });
});

router.post('/', (req, res) => {
  const db = getDB();
  const { type, title, note, date, month, due_time, order_index } = req.body || {};
  if (!isValidType(type)) {
    return res.status(400).json({ error: 'type は daily または monthly を指定してください' });
  }
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title は必須です' });
  }
  if (type === 'daily' && !date) {
    return res.status(400).json({ error: 'daily タスクには date（YYYY-MM-DD）が必要です' });
  }
  if (type === 'monthly' && !month) {
    return res.status(400).json({ error: 'monthly タスクには month（YYYY-MM）が必要です' });
  }
  const createdAt = nowIso();
  const updatedAt = createdAt;
  const sql = `INSERT INTO tasks (type, title, note, date, month, due_time, completed, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`;
  const params = [type, title.trim(), note || null, date || null, month || null, due_time || null, order_index || null, createdAt, updatedAt];
  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ id: this.lastID });
  });
});

router.patch('/:id', (req, res) => {
  const db = getDB();
  const { id } = req.params;
  const { title, note, due_time, completed, order_index } = req.body || {};
  const updatedAt = nowIso();
  const fields = [];
  const params = [];
  if (typeof title === 'string') { fields.push('title = ?'); params.push(title.trim()); }
  if (typeof note === 'string') { fields.push('note = ?'); params.push(note); }
  if (typeof due_time === 'string') { fields.push('due_time = ?'); params.push(due_time); }
  if (typeof completed === 'boolean' || completed === 0 || completed === 1) { fields.push('completed = ?'); params.push(completed ? 1 : 0); }
  if (typeof order_index === 'number') { fields.push('order_index = ?'); params.push(order_index); }
  fields.push('updated_at = ?'); params.push(updatedAt);
  if (fields.length === 1) {
    return res.status(400).json({ error: '更新対象がありません' });
  }
  const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;
  params.push(id);
  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '対象が見つかりません' });
    }
    res.json({ success: true });
  });
});

router.delete('/:id', (req, res) => {
  const db = getDB();
  const { id } = req.params;
  db.run('DELETE FROM tasks WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '対象が見つかりません' });
    }
    res.json({ success: true });
  });
});

module.exports = router;

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

(function ensureTemplateTables() {
  const db = getDB();
  const ddl = `
    CREATE TABLE IF NOT EXISTS daily_task_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weekday INTEGER NOT NULL,
      title TEXT NOT NULL,
      note TEXT,
      due_time TEXT,
      order_index INTEGER,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_daily_templates_weekday ON daily_task_templates(weekday);
    CREATE TABLE IF NOT EXISTS monthly_task_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_month INTEGER,
      is_last_day INTEGER DEFAULT 0,
      title TEXT NOT NULL,
      note TEXT,
      due_time TEXT,
      order_index INTEGER,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_monthly_templates_day ON monthly_task_templates(day_of_month);
    CREATE TABLE IF NOT EXISTS company_holidays (
      date TEXT PRIMARY KEY,
      name TEXT
    );
  `;
  db.exec(ddl, (err) => {
    try { db.close(); } catch {}
    if (err) {}
  });
})();

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function ym(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }

async function generateDailyIfMissing(db, dateStr) {
  const d = new Date(dateStr);
  const weekday = d.getDay();
  const templates = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM daily_task_templates WHERE active = 1 AND weekday = ?', [weekday], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
  for (const t of templates) {
    const exists = await new Promise((resolve) => {
      db.get('SELECT id FROM tasks WHERE type = "daily" AND date = ? AND title = ?', [dateStr, t.title], (err, row) => {
        if (err) return resolve(true);
        resolve(!!row);
      });
    });
    if (!exists) {
      const monthStr = ym(d);
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO tasks (type, title, note, date, month, due_time, completed, order_index, created_at, updated_at) VALUES ("daily", ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [t.title, t.note || null, dateStr, monthStr, t.due_time || null, t.order_index || null],
          (err) => { if (err) return reject(err); resolve(); }
        );
      });
    }
  }
}

async function generateMonthlyIfMissing(db, monthStr) {
  const [year, m] = monthStr.split('-').map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const templates = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM monthly_task_templates WHERE active = 1', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
  async function isHoliday(dateStr) {
    return new Promise((resolve) => {
      db.get('SELECT 1 FROM company_holidays WHERE date = ?', [dateStr], (err, row) => {
        resolve(!!row);
      });
    });
  }
  async function adjustToBusinessDay(dateStr) {
    let d = new Date(dateStr);
    while (true) {
      const wd = d.getDay();
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const hol = await isHoliday(ds);
      if (wd !== 0 && wd !== 6 && !hol) return ds;
      d.setDate(d.getDate() - 1);
    }
  }
  for (const t of templates) {
    const day = t.is_last_day ? lastDay : Number(t.day_of_month);
    if (!day || day < 1 || day > lastDay) continue;
    const dateStrRaw = `${monthStr}-${pad2(day)}`;
    const dateStr = await adjustToBusinessDay(dateStrRaw);
    const exists = await new Promise((resolve) => {
      db.get('SELECT id FROM tasks WHERE type = "monthly" AND month = ? AND date = ? AND title = ?', [monthStr, dateStr, t.title], (err, row) => {
        if (err) return resolve(true);
        resolve(!!row);
      });
    });
    if (!exists) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO tasks (type, title, note, date, month, due_time, completed, order_index, created_at, updated_at) VALUES ("monthly", ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [t.title, t.note || null, dateStr, monthStr, t.due_time || null, t.order_index || null],
          (err) => { if (err) return reject(err); resolve(); }
        );
      });
    }
  }
}

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
    generateDailyIfMissing(db, date).then(() => {}).catch(() => {});
    sql = `SELECT * FROM tasks WHERE type = 'daily' AND date = ? ORDER BY COALESCE(order_index, created_at) ASC, id ASC`;
    params = [date];
  } else {
    if (!month) {
      return res.status(400).json({ error: 'month を指定してください（YYYY-MM）' });
    }
    generateMonthlyIfMissing(db, month).then(() => {}).catch(() => {});
    sql = `SELECT * FROM tasks WHERE type = 'monthly' AND month = ? ORDER BY COALESCE(date, created_at) ASC, COALESCE(order_index, created_at) ASC, id ASC`;
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

router.get('/incomplete-summary', (req, res) => {
  const db = getDB();
  const { date, month } = req.query;
  const today = date || ymd(new Date());
  const mon = month || ym(new Date());
  db.get('SELECT COUNT(*) AS cnt FROM tasks WHERE type = "daily" AND date = ? AND completed = 0', [today], (e1, r1) => {
    db.get('SELECT COUNT(*) AS cnt FROM tasks WHERE type = "monthly" AND date = ? AND completed = 0', [today], (e2, r2) => {
      res.json({ dailyIncomplete: r1?.cnt || 0, monthlyIncompleteToday: r2?.cnt || 0 });
    });
  });
});

router.get('/templates/daily', (req, res) => {
  const db = getDB();
  db.all('SELECT * FROM daily_task_templates ORDER BY weekday ASC, COALESCE(order_index, created_at) ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/templates/daily', (req, res) => {
  const db = getDB();
  const { weekday, title, due_time, note, order_index } = req.body || {};
  if (typeof weekday !== 'number' || weekday < 0 || weekday > 6) return res.status(400).json({ error: 'weekday は 0-6 で指定してください' });
  if (!title) return res.status(400).json({ error: 'title は必須です' });
  db.run('INSERT INTO daily_task_templates (weekday, title, note, due_time, order_index, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [weekday, title.trim(), note || null, due_time || null, order_index || null], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID });
  });
});

router.delete('/templates/daily/:id', (req, res) => {
  const db = getDB();
  db.run('DELETE FROM daily_task_templates WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: this.changes > 0 });
  });
});

router.get('/templates/monthly', (req, res) => {
  const db = getDB();
  db.all('SELECT * FROM monthly_task_templates ORDER BY COALESCE(is_last_day,0) ASC, COALESCE(day_of_month, 0) ASC, COALESCE(order_index, created_at) ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/templates/monthly', (req, res) => {
  const db = getDB();
  const { day_of_month, is_last_day, title, due_time, note, order_index } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title は必須です' });
  const isLast = is_last_day ? 1 : 0;
  if (!isLast) {
    const dom = Number(day_of_month);
    if (!dom || dom < 1 || dom > 31) return res.status(400).json({ error: 'day_of_month は 1-31 で指定してください' });
  }
  db.run('INSERT INTO monthly_task_templates (day_of_month, is_last_day, title, note, due_time, order_index, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [isLast ? null : Number(day_of_month), isLast, title.trim(), note || null, due_time || null, order_index || null], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID });
  });
});

router.delete('/templates/monthly/:id', (req, res) => {
  const db = getDB();
  db.run('DELETE FROM monthly_task_templates WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: this.changes > 0 });
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

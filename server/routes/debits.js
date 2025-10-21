const express = require('express');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const { getDB } = require('../connection');
const moment = require('moment');

const router = express.Router();

function readGinkouFile() {
  // プロジェクト直下の ginkou.csv を参照
  const csvPath = path.resolve(__dirname, '..', '..', 'ginkou.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`ファイルが見つかりません: ${csvPath}`);
  }
  const buf = fs.readFileSync(csvPath);
  // Windows系の銀行データは CP932 (Shift_JIS互換) が安全
  const text = iconv.decode(buf, 'CP932');
  // 改行を正規化
  return text.replace(/\r\n/g, '\n').split('\n').filter(l => l.length > 0);
}

function lastDigitRun(line) {
  // 末尾から連続する数字（例: 金額候補）を抽出
  const m = line.match(/(\d+)\s*$/);
  return m ? m[1] : null;
}

// プレビュー: 先頭50行の概要
router.get('/preview', (req, res) => {
  try {
    const rawLines = readGinkouFile();

    const previewLines = rawLines.slice(0, 50).map((l, i) => {
      const recordType = l.charAt(0) || '';
      const amountCandidate = lastDigitRun(l);
      return {
        idx: i + 1,
        recordType,
        length: l.length,
        amountCandidate,
        sample: l
      };
    });

    const recordTypeCounts = rawLines.reduce((acc, l) => {
      const t = l.charAt(0) || '';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    res.json({
      encoding: 'CP932',
      totalLines: rawLines.length,
      recordTypeCounts,
      previewLines
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// 解析: 名前推定と金額合計
router.get('/parse', (req, res) => {
  try {
    const lines = readGinkouFile();
    const dataLines = lines.filter(l => (l.charAt(0) || '') === '2');

    // 半角カナの連続ブロックを名前候補として抽出
    const kanaRegex = /[｡-ﾟ\s]+/; // 半角カナと空白
    const parsed = dataLines.slice(0, 200).map((l, i) => {
      const amount = lastDigitRun(l);
      // 名前候補: 最大の半角カナ連続部分を選ぶ
      let nameCandidate = '';
      const segments = l.split(/\s{2,}/).filter(s => s.length > 0);
      let bestScore = -1;
      for (const seg of segments) {
        const kanaCount = (seg.match(/[｡-ﾟ]/g) || []).length;
        if (kanaCount > bestScore) {
          bestScore = kanaCount;
          nameCandidate = seg.trim();
        }
      }
      return {
        idx: i + 1,
        length: l.length,
        name: nameCandidate,
        amountCandidate: amount,
        raw: l
      };
    });

    const totalAmount = parsed.reduce((sum, r) => {
      const n = r.amountCandidate ? parseInt(r.amountCandidate.replace(/\D/g, ''), 10) : 0;
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    res.json({
      linesAnalyzed: parsed.length,
      totalAmountCandidate: totalAmount,
      items: parsed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 生成API: 指定月・（任意）コースで引き落し対象顧客のCSVを生成
router.get('/generate', async (req, res) => {
  const monthStr = String(req.query.month || '').trim(); // YYYY-MM
  const courseIdStr = req.query.courseId ? String(req.query.courseId).trim() : '';
  if (!monthStr || !/^[0-9]{4}-[0-9]{2}$/.test(monthStr)) {
    return res.status(400).json({ error: 'month は YYYY-MM 形式で指定してください' });
  }
  const y = parseInt(monthStr.slice(0, 4), 10);
  const m = parseInt(monthStr.slice(5, 7), 10);
  const courseId = courseIdStr && /^[0-9]+$/.test(courseIdStr) ? parseInt(courseIdStr, 10) : null;

  const db = getDB();
  try {
    await ensureLedgerTables(db);
    // 対象顧客（billing_method = 'debit'）を抽出
    const customers = await new Promise((resolve, reject) => {
      const sql = `
        SELECT c.id, c.custom_id, c.customer_name, c.course_id, cs.rounding_enabled
        FROM customers c
        LEFT JOIN customer_settings cs ON cs.customer_id = c.id
        WHERE COALESCE(cs.billing_method, 'collection') = 'debit'
          ${courseId ? 'AND c.course_id = ?' : ''}
        ORDER BY c.delivery_order ASC, c.id ASC
      `;
      const params = courseId ? [courseId] : [];
      db.all(sql, params, (err, rows) => { if (err) return reject(err); resolve(rows || []); });
    });

    const entries = [];
    for (const c of customers) {
      const roundingEnabled = (c.rounding_enabled === 1 || c.rounding_enabled === null || typeof c.rounding_enabled === 'undefined') ? true : c.rounding_enabled === 1;
      const invRow = await new Promise((resolve, reject) => {
        db.get('SELECT amount, status FROM ar_invoices WHERE customer_id = ? AND year = ? AND month = ?', [c.id, y, m], (err, r) => {
          if (err) return reject(err);
          resolve(r || null);
        });
      });
      let amount;
      if (invRow && typeof invRow.amount === 'number') {
        amount = invRow.amount;
      } else {
        const totalRaw = await computeMonthlyTotal(db, c.id, y, m);
        amount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
      }
      if (amount > 0) {
        entries.push({ customer_id: c.id, custom_id: c.custom_id || '', customer_name: c.customer_name || '', amount });
      }
    }

    // CSV組み立て（ヘッダあり）。必要項目は今後拡張予定。
    const header = ['customer_id', 'custom_id', 'customer_name', 'amount'].join(',');
    const lines = entries.map(e => [e.customer_id, e.custom_id, e.customer_name.replace(/[,\r\n]/g, ' '), e.amount].join(','));
    const csvText = [header, ...lines].join('\r\n') + '\r\n';

    const buf = iconv.encode(csvText, 'CP932');
    res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
    res.setHeader('Content-Disposition', 'attachment; filename="ginkou.csv"');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db.close();
  }
});

// プレビュー: 先頭50行の概要
router.get('/preview', (req, res) => {
  try {
    const rawLines = readGinkouFile();

    const previewLines = rawLines.slice(0, 50).map((l, i) => {
      const recordType = l.charAt(0) || '';
      const amountCandidate = lastDigitRun(l);
      return {
        idx: i + 1,
        recordType,
        length: l.length,
        amountCandidate,
        sample: l
      };
    });

    const recordTypeCounts = rawLines.reduce((acc, l) => {
      const t = l.charAt(0) || '';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    res.json({
      encoding: 'CP932',
      totalLines: rawLines.length,
      recordTypeCounts,
      previewLines
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// 解析: 名前推定と金額合計
router.get('/parse', (req, res) => {
  try {
    const lines = readGinkouFile();
    const dataLines = lines.filter(l => (l.charAt(0) || '') === '2');

    // 半角カナの連続ブロックを名前候補として抽出
    const kanaRegex = /[｡-ﾟ\s]+/; // 半角カナと空白
    const parsed = dataLines.slice(0, 200).map((l, i) => {
      const amount = lastDigitRun(l);
      // 名前候補: 最大の半角カナ連続部分を選ぶ
      let nameCandidate = '';
      const segments = l.split(/\s{2,}/).filter(s => s.length > 0);
      let bestScore = -1;
      for (const seg of segments) {
        const kanaCount = (seg.match(/[｡-ﾟ]/g) || []).length;
        if (kanaCount > bestScore) {
          bestScore = kanaCount;
          nameCandidate = seg.trim();
        }
      }
      return {
        idx: i + 1,
        length: l.length,
        name: nameCandidate,
        amountCandidate: amount,
        raw: l
      };
    });

    const totalAmount = parsed.reduce((sum, r) => {
      const n = r.amountCandidate ? parseInt(r.amountCandidate.replace(/\D/g, ''), 10) : 0;
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    res.json({
      linesAnalyzed: parsed.length,
      totalAmountCandidate: totalAmount,
      items: parsed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DBユーティリティ: 売掛テーブル作成（既存関数の簡易コピー）
function ensureLedgerTables(db) {
  const sql = `
    CREATE TABLE IF NOT EXISTS ar_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      rounding_enabled INTEGER NOT NULL,
      status TEXT DEFAULT 'confirmed',
      confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(customer_id, year, month),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS ar_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT CHECK (method IN ('collection','debit')),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `;
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => { if (err) return reject(err); resolve(); });
  });
}

// 月次カレンダー生成（customers.jsからのロジック簡易コピー）
function generateMonthlyCalendar(year, month, patterns, temporaryChanges = []) {
  const safeParse = (val) => { try { return JSON.parse(val); } catch { return val; } };
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
    const dayData = { date: currentDateStr, day: date.date(), dayOfWeek, products: [] };
    const validPatterns = patterns.filter(pattern => {
      if (pattern.start_date && moment(currentDateStr).isBefore(moment(pattern.start_date))) return false;
      if (pattern.end_date && moment(currentDateStr).isAfter(moment(pattern.end_date))) return false;
      return true;
    });
    const latestByProduct = new Map();
    validPatterns.forEach(p => {
      const key = p.product_id;
      const existing = latestByProduct.get(key);
      if (!existing || moment(p.start_date).isAfter(moment(existing.start_date))) latestByProduct.set(key, p);
    });
    Array.from(latestByProduct.values()).forEach(pattern => {
      let quantity = 0;
      if (pattern.daily_quantities) {
        const dailyQuantities = ensureObject(pattern.daily_quantities);
        quantity = dailyQuantities[dayOfWeek] || 0;
      } else {
        const deliveryDays = ensureArrayDays(pattern.delivery_days || []);
        if (deliveryDays.includes(dayOfWeek)) quantity = pattern.quantity || 0;
      }
      const dayChangesForProduct = temporaryChanges.filter(tc => tc.change_date === currentDateStr && tc.product_id === pattern.product_id);
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
          quantity: quantity,
          unitPrice: pattern.unit_price,
          unit: pattern.unit,
          amount: quantity * pattern.unit_price
        });
      }
    });
    temporaryChanges.forEach(tempChange => {
      if (tempChange.change_date === currentDateStr && tempChange.change_type === 'add' && tempChange.quantity > 0) {
        dayData.products.push({
          productName: `（臨時）${tempChange.product_name}`,
          quantity: tempChange.quantity,
          unitPrice: tempChange.unit_price,
          unit: tempChange.unit,
          amount: tempChange.quantity * tempChange.unit_price
        });
      }
    });
    calendar.push(dayData);
  }
  return calendar;
}

async function computeMonthlyTotal(db, customerId, year, month) {
  return new Promise((resolve, reject) => {
    const patternsQuery = `
      SELECT dp.*, p.product_name, p.unit, m.manufacturer_name
      FROM delivery_patterns dp
      JOIN products p ON dp.product_id = p.id
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE dp.customer_id = ?
    `;
    const temporaryQuery = `
      SELECT tc.*, p.product_name, p.unit_price, p.unit, m.manufacturer_name
      FROM temporary_changes tc
      JOIN products p ON tc.product_id = p.id
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE tc.customer_id = ?
        AND strftime('%Y', tc.change_date) = ?
        AND strftime('%m', tc.change_date) = ?
    `;
    db.all(patternsQuery, [customerId], (pErr, patterns) => {
      if (pErr) return reject(pErr);
      db.all(temporaryQuery, [customerId, String(year), String(month).padStart(2, '0')], (tErr, temporaryChanges) => {
        if (tErr) return reject(tErr);
        const calendar = generateMonthlyCalendar(year, month, patterns, temporaryChanges);
        const totalRaw = calendar.reduce((sum, day) => sum + day.products.reduce((s, p) => s + (p.amount || 0), 0), 0);
        resolve(totalRaw);
      });
    });
  });
}
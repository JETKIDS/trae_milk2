const express = require('express');
const iconv = require('iconv-lite');
const moment = require('moment');
const { getDB } = require('../connection');

const router = express.Router();

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

// 生成API: 指定月・（任意）コースで引き落し対象顧客のCSV/固定長を生成
router.get('/generate', async (req, res) => {
  const monthStr = String(req.query.month || '').trim(); // YYYY-MM
  const courseIdStr = req.query.courseId ? String(req.query.courseId).trim() : '';
  const format = String(req.query.format || '').trim().toLowerCase();
  const institutionIdStr = req.query.institutionId ? String(req.query.institutionId).trim() : '';
  const institutionId = institutionIdStr && /^[0-9]+$/.test(institutionIdStr) ? parseInt(institutionIdStr, 10) : null;
  if (!monthStr || !/^[0-9]{4}-[0-9]{2}$/.test(monthStr)) {
    return res.status(400).json({ error: 'month は YYYY-MM 形式で指定してください' });
  }
  const y = parseInt(monthStr.slice(0, 4), 10);
  const m = parseInt(monthStr.slice(5, 7), 10);
  const courseId = courseIdStr && /^[0-9]+$/.test(courseIdStr) ? parseInt(courseIdStr, 10) : null;

  const db = getDB();
  try {
    await ensureLedgerTables(db);
    const customers = await new Promise((resolve, reject) => {
      const sql = `
        SELECT c.id, c.custom_id, c.customer_name, c.course_id,
               cs.rounding_enabled, cs.bank_code, cs.branch_code, cs.account_type, cs.account_number, cs.account_holder_katakana
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
        entries.push({
          customer_id: c.id,
          custom_id: c.custom_id || '',
          customer_name: c.customer_name || '',
          amount,
          bank_code: c.bank_code || '',
          branch_code: c.branch_code || '',
          account_type: (c.account_type === 1 || c.account_type === 2) ? c.account_type : null,
          account_number: c.account_number || '',
          account_holder_katakana: c.account_holder_katakana || ''
        });
      }
    }

    let filtered = entries;
    if (format === 'zengin' || format === 'zengin_fixed') {
      const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/; // 半角カナとスペース
      filtered = entries.filter(e =>
        /^(\d){4}$/.test(e.bank_code) &&
        /^(\d){3}$/.test(e.branch_code) &&
        (e.account_type === 1 || e.account_type === 2) &&
        /^(\d){7}$/.test(e.account_number) &&
        halfKanaRegex.test(String(e.account_holder_katakana))
      );
    }

    if (format === 'zengin_fixed') {
      const padLeft = (s, len, ch = '0') => {
        s = String(s || '');
        if (s.length >= len) return s.slice(-len);
        return ch.repeat(len - s.length) + s;
      };
      const padRight = (s, len, ch = ' ') => {
        s = String(s || '');
        if (s.length >= len) return s.slice(0, len);
        return s + ch.repeat(len - s.length);
      };
      const toHalfKana = (input) => {
        if (!input) return '';
        let s = String(input);
        // 会社名などに含まれる日本語の読みを近似（ドメイン固有の簡易辞書）
        s = s.replace(/株式会社/g, 'カブシキガイシャ')
             .replace(/（株）/g, 'カブシキガイシャ')
             .replace(/㈱/g, 'カブシキガイシャ')
             .replace(/有限会社/g, 'ユウゲンガイシャ')
             .replace(/（有）/g, 'ユウゲンガイシャ')
             .replace(/㈲/g, 'ユウゲンガイシャ')
             .replace(/牛乳/g, 'ギュウニュウ');
        // ひらがな→カタカナ（半角化の前段階）
        s = s.replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
        const dakutenMap = {
          'ガ':'ｶﾞ','ギ':'ｷﾞ','グ':'ｸﾞ','ゲ':'ｹﾞ','ゴ':'ｺﾞ',
          'ザ':'ｻﾞ','ジ':'ｼﾞ','ズ':'ｽﾞ','ゼ':'ｾﾞ','ゾ':'ｿﾞ',
          'ダ':'ﾀﾞ','ヂ':'ﾁﾞ','ヅ':'ﾂﾞ','デ':'ﾃﾞ','ド':'ﾄﾞ',
          'バ':'ﾊﾞ','ヒ':'ﾋﾞ','フ':'ﾌﾞ','ヘ':'ﾍﾞ','ホ':'ﾎﾞ',
          'パ':'ﾊﾟ','ピ':'ﾋﾟ','プ':'ﾌﾟ','ペ':'ﾍﾟ','ポ':'ﾎﾟ',
          'ヴ':'ｳﾞ'
        };
        Object.keys(dakutenMap).forEach(k => { s = s.replace(new RegExp(k, 'g'), dakutenMap[k]); });
        // 長音記号は半角へ
        s = s.replace(/ー/g, 'ｰ');
        // 小書き仮名は半角へ
        s = s.replace(/ャ/g, 'ｬ').replace(/ュ/g, 'ｭ').replace(/ョ/g, 'ｮ')
             .replace(/ァ/g, 'ｧ').replace(/ィ/g, 'ｨ').replace(/ゥ/g, 'ｩ')
             .replace(/ェ/g, 'ｪ').replace(/ォ/g, 'ｫ').replace(/ッ/g, 'ｯ')
             .replace(/ヮ/g, 'ﾜ');
        // 残りのカタカナを半角へ（正しいマップを使用）
        const fullToHalf = {
          'ア':'ｱ','イ':'ｲ','ウ':'ｳ','エ':'ｴ','オ':'ｵ',
          'カ':'ｶ','キ':'ｷ','ク':'ｸ','ケ':'ｹ','コ':'ｺ',
          'サ':'ｻ','シ':'ｼ','ス':'ｽ','セ':'ｾ','ソ':'ｿ',
          'タ':'ﾀ','チ':'ﾁ','ツ':'ﾂ','テ':'ﾃ','ト':'ﾄ',
          'ナ':'ﾅ','ニ':'ﾆ','ヌ':'ﾇ','ネ':'ﾈ','ノ':'ﾉ',
          'ハ':'ﾊ','ヒ':'ﾋ','フ':'ﾌ','ヘ':'ﾍ','ホ':'ﾎ',
          'マ':'ﾏ','ミ':'ﾐ','ム':'ﾑ','メ':'ﾒ','モ':'ﾓ',
          'ヤ':'ﾔ','ユ':'ﾕ','ヨ':'ﾖ',
          'ラ':'ﾗ','リ':'ﾘ','ル':'ﾙ','レ':'ﾚ','ロ':'ﾛ',
          'ワ':'ﾜ','ヲ':'ｦ','ン':'ﾝ'
        };
        s = s.replace(/[ア-ン]/g, ch => fullToHalf[ch] || ch);
        // 全角スペースは半角に
        s = s.replace(/　/g, ' ');
        return s;
      };
      const companyNameRow = await new Promise(resolve => {
        db.get('SELECT company_name, company_name_kana_half FROM company_info WHERE id = 1', [], (err, row) => {
          if (err || !row) return resolve({ company_name: '', company_name_kana_half: '' });
          resolve(row);
        });
      });
      // 優先: マスタの会社名（読み・半角カナ）。未設定時は会社名から変換
      const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/;
      const companyNameKana = (companyNameRow.company_name_kana_half && halfKanaRegex.test(companyNameRow.company_name_kana_half))
        ? companyNameRow.company_name_kana_half
        : toHalfKana(companyNameRow.company_name || '');
      // 収納機関マスタの取得（任意）
      const institutionRow = await new Promise(resolve => {
        if (!institutionId) return resolve(null);
        db.get('SELECT institution_name, bank_code_7, agent_name_half, agent_code, header_leading_digit, bank_name, branch_name FROM institution_info WHERE id = ?', [institutionId], (err, row) => {
           if (err) return resolve(null);
           resolve(row || null);
         });
       });
      const agentNameRaw = institutionRow && institutionRow.agent_name_half ? institutionRow.agent_name_half : 'ﾆｺｽ';
      const agentName = (agentNameRaw && halfKanaRegex.test(agentNameRaw)) ? agentNameRaw : 'ﾆｺｽ';
      const agentField = padRight(agentName, 16, ' ');
      const nextMonth = moment(`${y}-${String(m).padStart(2, '0')}-01`).add(1, 'month');
      const drawDate = nextMonth.clone().date(12).format('MMDD');
      const companyNameKana30 = String(companyNameKana).slice(0, 30);
      // 会社名ではなく「収納機関登録内の委託者名」を優先してヘッダーの委託者名に使用
      const consignorNameBase = (institutionRow && institutionRow.agent_name_half && halfKanaRegex.test(institutionRow.agent_name_half))
        ? institutionRow.agent_name_half
        : companyNameKana;
      const consignorName30 = String(consignorNameBase).slice(0, 30);
      // ヘッダ先頭の数値列（仕様に合わせて既定は『1911』。マスタに値があればそれを採用）
      const headerLeading = institutionRow && institutionRow.header_leading_digit
        ? String(institutionRow.header_leading_digit)
        : '1911';
      // 銀行コード7桁（銀行/支店表示用）
      const bankCode7 = institutionRow && institutionRow.bank_code_7 ? String(institutionRow.bank_code_7).replace(/\D/g, '').slice(0,7) : '';
      // 委託者コード（10桁）は収納機関登録の agent_code をそのまま使用（数値のみ抽出、10桁に左ゼロ埋め／超過は先頭10桁）
      const clientCode10Raw = institutionRow && institutionRow.agent_code ? String(institutionRow.agent_code).replace(/\D/g, '') : '';
      const clientCode10 = padLeft(clientCode10Raw.slice(0, 10), 10, '0');
      // 金融機関コードの分割（前半4桁/下3桁）と名称（半角カナ）
      const bankCodeFirst4 = bankCode7.length === 7 ? bankCode7.slice(0, 4) : '9900';
      const bankCodeLast3 = bankCode7.length === 7 ? bankCode7.slice(4) : '000';
      const bankNameHalf = toHalfKana(institutionRow && institutionRow.bank_name ? institutionRow.bank_name : agentName);
      const branchNameHalf = toHalfKana(institutionRow && institutionRow.branch_name ? institutionRow.branch_name : agentName);
      // レコード行（顧客情報）では銀行名/支店名は各16桁幅（右スペース埋め）で出力
      const bankNameField16 = padRight(bankNameHalf, 16, ' ');
      const branchNameField16 = padRight(branchNameHalf, 16, ' ');
      // ヘッダーは全銀固定長仕様に合わせて各フィールドを固定幅で出力し、残りは右スペース埋めで120桁に調整
      const consignorField30 = padRight(consignorName30, 30, ' ');
      const headerCore = headerLeading
        + clientCode10
        + consignorField30
        + drawDate
        + bankCodeFirst4
        + bankNameField16
        + bankCodeLast3
        + branchNameField16
        + '10000000';
      const headerLine = padRight(headerCore, 120, ' ');
      const fixedLines = filtered.map(e => {
        const recordType = '2';
        const bank = padLeft(e.bank_code, 4, '0');
        const bankNameOut = bankNameField16;
        const branch = padLeft(e.branch_code, 3, '0');
        const branchNameOut = branchNameField16;
        const kind = String(e.account_type);
        const acct = padLeft(e.account_number, 7, '0');
        const name = padRight(String(e.account_holder_katakana), 30, ' ');
        const amount = padLeft(String(e.amount), 10, '0');
        const idWithZero = String(e.custom_id || '').replace(/[^0-9]/g, '') + '0';
        const idPadded = padLeft(idWithZero, 8, '0');
        // tail 構成: 1 + 17ゼロ + 請求先ID(8桁) + 予備スペース(6桁) = 合計32桁
        // 予備スペースを 8 → 6 に調整し、明細1行の総文字数を120に統一する
        const tail = '1' + '0'.repeat(17) + idPadded + ' '.repeat(6);
        return recordType + bank + bankNameOut + branch + branchNameOut + kind + acct + name + amount + tail;
      });
      console.log(`[debits] header length(chars)=${headerLine.length}`);
      console.log(`[debits] header sample='${headerLine}'`);
      if (fixedLines.length > 0) {
        console.log(`[debits] first detail length(chars)=${fixedLines[0].length}`);
        console.log(`[debits] first detail sample='${fixedLines[0]}'`);
      }
      const text = [headerLine, ...fixedLines].join('\r\n') + '\r\n';
      const buf = iconv.encode(text, 'CP932');
      res.setHeader('Content-Type', 'text/plain; charset=Shift_JIS');
      res.setHeader('Content-Disposition', 'attachment; filename="zengin_fixed.txt"');
      return res.status(200).send(buf);
    }

    let header;
    let lines;
    if (format === 'zengin') {
      header = ['bank_code','branch_code','account_type','account_number','account_holder_katakana','amount','customer_id','custom_id','customer_name'].join(',');
      lines = filtered.map(e => [
        e.bank_code,
        e.branch_code,
        e.account_type,
        e.account_number,
        String(e.account_holder_katakana).replace(/[,\r\n]/g, ' '),
        e.amount,
        e.customer_id,
        e.custom_id,
        String(e.customer_name).replace(/[,\r\n]/g, ' ')
      ].join(','));
    } else {
      header = ['customer_id','custom_id','customer_name','amount'].join(',');
      lines = filtered.map(e => [
        e.customer_id,
        e.custom_id,
        String(e.customer_name).replace(/[,\r\n]/g, ' '),
        e.amount
      ].join(','));
    }
    const csvText = [header, ...lines].join('\r\n') + '\r\n';

    const buf = iconv.encode(csvText, 'CP932');
    res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
    const filename = format === 'zengin' ? 'zengin.csv' : 'ginkou.csv';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    try { db && db.close(); } catch {}
  }
});

module.exports = router;
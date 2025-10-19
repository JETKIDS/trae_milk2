/**
 * 配達コース再構築スクリプト
 * - コースを6コース（001〜006）に統一し、名称を「コースA」〜「コースF」に設定
 * - 顧客の配達曜日に基づき、以下のペアに該当する顧客をコースA〜Cへ再割当
 *   A: 月・木 (1,4) -> 001
 *   B: 火・金 (2,5) -> 002
 *   C: 水・土 (3,6) -> 003
 * - 上記ペアに該当しない顧客は暫定的に「コースF (006)」へ移動（要確認）
 * - 各コースの delivery_order を 1 からの連番に再採番
 * - 既存の 001〜006 以外のコースで顧客がゼロのものは削除
 *
 * 実行方法（プロジェクトルートで）:
 *   node server/scripts/restructure_courses.js
 */
const { getDB } = require('../connection');

function safeParseJSON(str, fallback) {
  if (str === null || typeof str === 'undefined') return fallback;
  try {
    const v = JSON.parse(String(str));
    return v;
  } catch (e) {
    return fallback;
  }
}

function ensureSixCourses(db) {
  return new Promise((resolve, reject) => {
    const desired = [
      { custom_id: '001', course_name: 'コースA', description: '月木ペア' },
      { custom_id: '002', course_name: 'コースB', description: '火金ペア' },
      { custom_id: '003', course_name: 'コースC', description: '水土ペア' },
      { custom_id: '004', course_name: 'コースD', description: '' },
      { custom_id: '005', course_name: 'コースE', description: '' },
      { custom_id: '006', course_name: 'コースF', description: 'その他・未分類' },
    ];
    db.all('SELECT id, custom_id, course_name FROM delivery_courses', [], (err, rows) => {
      if (err) return reject(err);
      const byCustom = new Map((rows || []).map(r => [String(r.custom_id), r]));
      const ops = [];
      desired.forEach(d => {
        const existing = byCustom.get(d.custom_id);
        if (!existing) {
          ops.push({ type: 'insert', custom_id: d.custom_id, course_name: d.course_name, description: d.description });
        } else if (existing.course_name !== d.course_name) {
          ops.push({ type: 'update', id: existing.id, custom_id: d.custom_id, course_name: d.course_name, description: d.description });
        }
      });

      const runOps = async () => {
        for (const op of ops) {
          if (op.type === 'insert') {
            await new Promise((resolve2, reject2) => {
              db.run(
                'INSERT INTO delivery_courses (custom_id, course_name, description) VALUES (?, ?, ?)',
                [op.custom_id, op.course_name, op.description],
                function(err2) { if (err2) return reject2(err2); resolve2(); }
              );
            });
          } else if (op.type === 'update') {
            await new Promise((resolve2, reject2) => {
              db.run(
                'UPDATE delivery_courses SET course_name = ?, description = ? WHERE id = ?',
                [op.course_name, op.description, op.id],
                function(err2) { if (err2) return reject2(err2); resolve2(); }
              );
            });
          }
        }
        db.all('SELECT id, custom_id, course_name FROM delivery_courses WHERE custom_id IN ("001","002","003","004","005","006") ORDER BY custom_id ASC', [], (err3, rows2) => {
          if (err3) return reject(err3);
          const idMap = new Map((rows2 || []).map(r => [String(r.custom_id), r.id]));
          resolve({ idMap, rows: rows2 });
        });
      };

      runOps().catch(reject);
    });
  });
}

function computeCustomerDays(db, customerId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT delivery_days, daily_quantities FROM delivery_patterns WHERE customer_id = ? AND (is_active = 1 OR is_active IS NULL)',
      [customerId],
      (err, rows) => {
        if (err) return reject(err);
        const set = new Set(); // dayOfWeek: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
        (rows || []).forEach(r => {
          const dq = safeParseJSON(r.daily_quantities, null);
          if (dq && typeof dq === 'object') {
            Object.keys(dq).forEach(k => {
              const day = Number(k);
              const qty = Number(dq[k]);
              if (!isNaN(day) && qty > 0) set.add(day);
            });
          } else {
            const arr = safeParseJSON(r.delivery_days, []);
            (arr || []).forEach(d => { const day = Number(d); if (!isNaN(day)) set.add(day); });
          }
        });
        resolve(Array.from(set.values()).sort((a,b) => a-b));
      }
    );
  });
}

function decideCourseByDays(days) {
  const has = (d) => days.includes(d);
  const a = has(1) && has(4); // Mon & Thu
  const b = has(2) && has(5); // Tue & Fri
  const c = has(3) && has(6); // Wed & Sat
  // 単一ペアのみを優先（複数同時該当は未分類=F）
  const matches = [a ? 'A' : null, b ? 'B' : null, c ? 'C' : null].filter(Boolean);
  if (matches.length === 1) {
    return matches[0];
  }
  return null; // ambiguous or none
}

async function reassignCustomers(db, idMap) {
  const result = { movedA: 0, movedB: 0, movedC: 0, movedF: 0, ambiguous: [] };
  const customers = await new Promise((resolve, reject) => {
    db.all('SELECT id FROM customers ORDER BY id ASC', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
  for (const c of customers) {
    const days = await computeCustomerDays(db, c.id);
    const dec = decideCourseByDays(days);
    let targetCourseId = null;
    if (dec === 'A') targetCourseId = idMap.get('001');
    else if (dec === 'B') targetCourseId = idMap.get('002');
    else if (dec === 'C') targetCourseId = idMap.get('003');
    else targetCourseId = idMap.get('006'); // 未分類はFへ

    await new Promise((resolve, reject) => {
      db.run('UPDATE customers SET course_id = ? WHERE id = ?', [targetCourseId, c.id], function(err) {
        if (err) return reject(err);
        resolve();
      });
    });

    if (dec === 'A') result.movedA++; else if (dec === 'B') result.movedB++; else if (dec === 'C') result.movedC++; else result.movedF++;
    if (dec === null) result.ambiguous.push({ customer_id: c.id, days });
  }
  return result;
}

async function resequenceDeliveryOrder(db, idMap) {
  const targets = ['001','002','003','004','005','006'];
  for (const cid of targets) {
    const courseId = idMap.get(cid);
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT id FROM customers WHERE course_id = ? ORDER BY delivery_order ASC, id ASC', [courseId], (err, r) => {
        if (err) return reject(err);
        resolve(r || []);
      });
    });
    for (let i = 0; i < rows.length; i++) {
      const custId = rows[i].id;
      await new Promise((resolve, reject) => {
        db.run('UPDATE customers SET delivery_order = ? WHERE id = ?', [i+1, custId], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  }
}

async function deleteUnusedCourses(db, idMap) {
  const keepIds = new Set(['001','002','003','004','005','006']);
  const allCourses = await new Promise((resolve, reject) => {
    db.all('SELECT id, custom_id FROM delivery_courses', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
  for (const cr of allCourses) {
    if (!keepIds.has(String(cr.custom_id))) {
      const cnt = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) AS cnt FROM customers WHERE course_id = ?', [cr.id], (err, row) => {
          if (err) return reject(err);
          resolve(row ? row.cnt : 0);
        });
      });
      if (cnt === 0) {
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM delivery_courses WHERE id = ?', [cr.id], (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        console.log(`削除: 余剰コース custom_id=${cr.custom_id}`);
      } else {
        console.log(`保持: custom_id=${cr.custom_id}（顧客数 ${cnt}）`);
      }
    }
  }
}

async function main() {
  const db = getDB();
  try {
    console.log('--- コース再構築を開始します ---');
    await new Promise((resolve, reject) => db.exec('BEGIN TRANSACTION', err => err ? reject(err) : resolve()));

    const { idMap, rows } = await ensureSixCourses(db);
    console.log('コース準備完了:', rows.map(r => `${r.custom_id}:${r.course_name}`).join(', '));

    const reassigned = await reassignCustomers(db, idMap);
    console.log('再割当結果:', reassigned);

    await resequenceDeliveryOrder(db, idMap);
    console.log('delivery_order を再採番しました');

    await deleteUnusedCourses(db, idMap);

    await new Promise((resolve, reject) => db.exec('COMMIT', err => err ? reject(err) : resolve()));
    console.log('--- コース再構築が完了しました ---');

    if (reassigned.ambiguous.length > 0) {
      console.log('未分類（複数ペア該当・該当なし）のお客様一覧（コースFへ移動済み）');
      reassigned.ambiguous.slice(0, 50).forEach(a => {
        console.log(`  customer_id=${a.customer_id}, days=${JSON.stringify(a.days)}`);
      });
      if (reassigned.ambiguous.length > 50) {
        console.log(`  ... 他 ${reassigned.ambiguous.length - 50} 件`);
      }
    }
  } catch (e) {
    console.error('エラーが発生しました:', e);
    try { await new Promise((resolve) => db.exec('ROLLBACK', () => resolve())); } catch (_) {}
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../index');
const { getDB } = require('../connection');
const { initSchema, resetData, seedBasicData } = require('./helpers/dbSetup');

describe('bulkUpdate increase-delivery（休配処理）', () => {
  beforeAll(() => {
    initSchema();
  });
  beforeEach(async () => {
    await resetData();
    await seedBasicData();
    // 配達パターン: 月・水に数量2で配達
    const db = getDB();
    db.serialize(() => {
      db.run(`INSERT INTO delivery_patterns (customer_id, product_id, delivery_days, quantity, unit_price, start_date, is_active)
               VALUES (100, 1, '[1,3]', 2, 180, '2025-01-01', 1)`);
    });
    db.close();
  });

  test('休止（期間）で配達予定日のみskipが登録される', async () => {
    // 2025-07-01〜2025-07-07 のうち、予定日は 7/02(水) と 7/07(月)
    const res = await request(app)
      .post('/api/bulk-update/increase-delivery')
      .send({ courseId: 10, startDate: '2025-07-01', endDate: '2025-07-07' });
    expect(res.status).toBe(200);

    // temporary_changes を確認
    const db = getDB();
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT change_date, change_type FROM temporary_changes WHERE customer_id = 100 ORDER BY change_date`, [], (err, r) => {
        if (err) reject(err); else resolve(r);
      });
    });
    db.close();
    const dates = rows.filter(r => r.change_type === 'skip').map(r => r.change_date);
    expect(dates).toEqual(['2025-07-02', '2025-07-07']);
  });

  test('Undo（操作ログロールバック）でskipが復元（削除）される', async () => {
    // 実行
    const execRes = await request(app)
      .post('/api/bulk-update/increase-delivery')
      .send({ courseId: 10, startDate: '2025-07-01', endDate: '2025-07-07' });
    expect(execRes.status).toBe(200);

    // ログ一覧から最新のincrease-deliveryを取得
    const logs = await request(app).get('/api/bulk-update/logs');
    expect(logs.status).toBe(200);
    const latest = (logs.body || []).find(l => l.op_type === 'increase-delivery');
    expect(latest).toBeTruthy();

    // ロールバック
    const rb = await request(app).post(`/api/bulk-update/logs/${latest.id}/rollback`);
    expect(rb.status).toBe(200);

    // temporary_changes が削除されていることを確認
    const db = getDB();
    const count = await new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) AS c FROM temporary_changes WHERE customer_id = 100`, [], (err, r) => {
        if (err) reject(err); else resolve(r.c);
      });
    });
    db.close();
    expect(count).toBe(0);
  });
});
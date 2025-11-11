process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../index');
const { getDB } = require('../connection');
const { initSchema, resetData, seedBasicData } = require('./helpers/dbSetup');

describe('temporaryChanges API', () => {
  beforeAll(() => {
    initSchema();
  });
  beforeEach(async () => {
    await resetData();
    await seedBasicData();
  });

  test('拒否: 確定済みの年月には臨時変更を作成できない', async () => {
    const db = getDB();
    // 2025-07 を確定に設定
    await new Promise((resolve) => db.run(
      `INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status) VALUES (100, 2025, 7, 0, 0, 'confirmed')`,
      [],
      resolve
    ));
    db.close();

    const res = await request(app)
      .post('/api/temporary-changes')
      .send({
        customer_id: 100,
        change_date: '2025-07-10',
        change_type: 'modify',
        product_id: 1,
        quantity: 2,
        unit_price: null,
        reason: 'テスト'
      });
    expect(res.status).toBe(400);
    expect(res.body && res.body.error).toMatch(/確定済み/);
  });

  test('許可: 未確定の年月には臨時変更を作成できる', async () => {
    const res = await request(app)
      .post('/api/temporary-changes')
      .send({
        customer_id: 100,
        change_date: '2025-08-05',
        change_type: 'modify',
        product_id: 1,
        quantity: 3,
        unit_price: null,
        reason: 'テストOK'
      });
    expect(res.status).toBe(201);
    expect(res.body && res.body.id).toBeDefined();
  });

  test('拒否: 確定済みの年月では臨時変更の削除も不可', async () => {
    // まず未確定で1件作成
    const created = await request(app)
      .post('/api/temporary-changes')
      .send({
        customer_id: 100,
        change_date: '2025-09-02',
        change_type: 'skip',
        product_id: 1,
        reason: '一時休止'
      });
    expect(created.status).toBe(201);
    const id = created.body.id;

    // その月を確定状態にする
    const db = getDB();
    await new Promise((resolve) => db.run(
      `INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status) VALUES (100, 2025, 9, 0, 0, 'confirmed')`,
      [],
      resolve
    ));
    db.close();

    const del = await request(app).delete(`/api/temporary-changes/${id}`);
    expect(del.status).toBe(400);
    expect(del.body && del.body.error).toMatch(/確定済み/);
  });
});
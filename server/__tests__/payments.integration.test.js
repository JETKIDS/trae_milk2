process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../index');
const { initSchema, resetData, seedBasicData } = require('./helpers/dbSetup');
const { getDB } = require('../connection');

describe('payments API integration', () => {
  const customerId = 100; // seedBasicData が登録
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  beforeAll(() => {
    initSchema();
  });
  beforeEach(async () => {
    await resetData();
    await seedBasicData();
  });

  test('個別入金登録→一覧取得→メモ更新→取消', async () => {
    // 1) 個別入金登録
    const create = await request(app)
      .post(`/api/customers/${customerId}/payments`)
      .send({ year, month, amount: 1200, method: 'collection', note: '初回' });
    expect(create.status).toBe(200);
    expect(create.body && create.body.amount).toBe(1200);

    // 2) 一覧取得（最新が先頭）
    const list1 = await request(app)
      .get(`/api/customers/${customerId}/payments`)
      .query({ year, month, limit: 10 });
    expect(list1.status).toBe(200);
    expect(Array.isArray(list1.body)).toBe(true);
    expect(list1.body.length).toBeGreaterThanOrEqual(1);
    const latest = list1.body[0];
    expect(latest.amount).toBe(1200);
    const pid = latest.id;

    // 3) メモ更新
    const patch = await request(app)
      .patch(`/api/customers/${customerId}/payments/${pid}`)
      .send({ note: 'メモ更新' });
    expect(patch.status).toBe(200);
    expect(patch.body && patch.body.note).toBe('メモ更新');

    // 4) 取消（負の入金を追加）
    const cancel = await request(app)
      .post(`/api/customers/${customerId}/payments/${pid}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body && cancel.body.amount).toBe(-1200);

    // 5) 合計確認（顧客当月入金一覧から集計）
    const list2 = await request(app)
      .get(`/api/customers/${customerId}/payments`)
      .query({ year, month, limit: 50 });
    expect(list2.status).toBe(200);
    const total = (list2.body || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
    // 1200 と -1200 の相殺で 0 のはず
    expect(total).toBe(0);
  });

  test('一括入金登録（成功1件）', async () => {
    // 前月請求を確定しておく（ビジネスルールにより未確定は一括入金不可）
    const prevY = month === 1 ? (year - 1) : year;
    const prevM = month === 1 ? 12 : (month - 1);
    const db = getDB();
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status)
         VALUES (?, ?, ?, ?, ?, 'confirmed')`,
        [customerId, prevY, prevM, 0, 0],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
    db.close();

    // 1件分のエントリを登録
    const batch = await request(app)
      .post('/api/customers/payments/batch')
      .send({ year, month, method: 'collection', entries: [{ customer_id: customerId, amount: 300, note: '一括' }] });
    expect(batch.status).toBe(200);
    expect(batch.body && batch.body.success).toBe(1);

    // 顧客当月入金一覧の合計が 300 であること
    const list = await request(app)
      .get(`/api/customers/${customerId}/payments`)
      .query({ year, month, limit: 50 });
    expect(list.status).toBe(200);
    const total = (list.body || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
    expect(total).toBe(300);
  });

  test('バリデーション: amount=0 と method=foo は 400', async () => {
    const badAmt = await request(app)
      .post(`/api/customers/${customerId}/payments`)
      .send({ year, month, amount: 0, method: 'collection' });
    expect(badAmt.status).toBe(400);

    const badMethod = await request(app)
      .post(`/api/customers/${customerId}/payments`)
      .send({ year, month, amount: 500, method: 'foo' });
    expect(badMethod.status).toBe(400);
  });
});
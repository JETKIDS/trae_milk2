process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../index');
const { getDB } = require('../connection');
const { initSchema, resetData, seedBasicData } = require('./helpers/dbSetup');

describe('deliveryPatterns 終了日短縮・延長の確定月ルール', () => {
  beforeAll(() => {
    initSchema();
  });
  beforeEach(async () => {
    await resetData();
    await seedBasicData();
    const db = getDB();
    await new Promise((resolve) => db.run(
      `INSERT INTO delivery_patterns (id, customer_id, product_id, delivery_days, quantity, unit_price, start_date, end_date, is_active)
       VALUES (1000, 100, 1, '[1,3]', 2, 180, '2025-01-01', NULL, 1)`,
      [],
      resolve
    ));
    db.close();
  });

  test('短縮: 指定終了日が最新の確定月より前だと更新不可', async () => {
    // 2025-05 を確定
    const db = getDB();
    await new Promise((resolve) => db.run(
      `INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status) VALUES (100, 2025, 5, 0, 0, 'confirmed')`,
      [],
      resolve
    ));
    db.close();

    const res = await request(app)
      .put('/api/delivery-patterns/1000')
      .send({
        product_id: 1,
        quantity: 2,
        unit_price: 180,
        delivery_days: '[1,3]',
        daily_quantities: null,
        start_date: '2025-01-01',
        end_date: '2025-04-30', // 最新の確定 2025-05 より前
        is_active: 1
      });
    expect(res.status).toBe(400);
    expect(res.body && res.body.error).toMatch(/確定済み/);
  });

  test('短縮: 指定終了日が最新の確定月以降なら更新可', async () => {
    // 2025-05 を確定
    const db = getDB();
    await new Promise((resolve) => db.run(
      `INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status) VALUES (100, 2025, 5, 0, 0, 'confirmed')`,
      [],
      resolve
    ));
    db.close();

    const res = await request(app)
      .put('/api/delivery-patterns/1000')
      .send({
        product_id: 1,
        quantity: 2,
        unit_price: 180,
        delivery_days: '[1,3]',
        daily_quantities: null,
        start_date: '2025-01-01',
        end_date: '2025-05-31', // 最新の確定 2025-05 と同月（以降）
        is_active: 1
      });
    expect(res.status).toBe(200);
    expect(res.body && res.body.message).toMatch(/更新されました/);
  });

  test('延長: 延長範囲に確定月が含まれる場合は更新不可', async () => {
    // まず終了日を 2025-05-31 に設定
    const setEnd = await request(app)
      .put('/api/delivery-patterns/1000')
      .send({
        product_id: 1,
        quantity: 2,
        unit_price: 180,
        delivery_days: '[1,3]',
        daily_quantities: null,
        start_date: '2025-01-01',
        end_date: '2025-05-31',
        is_active: 1
      });
    expect(setEnd.status).toBe(200);

    // 延長範囲（2025-06）に確定を設定
    const db = getDB();
    await new Promise((resolve) => db.run(
      `INSERT INTO ar_invoices (customer_id, year, month, amount, rounding_enabled, status) VALUES (100, 2025, 6, 0, 0, 'confirmed')`,
      [],
      resolve
    ));
    db.close();

    const res = await request(app)
      .put('/api/delivery-patterns/1000')
      .send({
        product_id: 1,
        quantity: 2,
        unit_price: 180,
        delivery_days: '[1,3]',
        daily_quantities: null,
        start_date: '2025-01-01',
        end_date: '2025-06-30', // 延長範囲に確定月 2025-06 が含まれる
        is_active: 1
      });
    expect(res.status).toBe(400);
    expect(res.body && res.body.error).toMatch(/確定済み/);
  });
});
const request = require('supertest');
const app = require('../index');

describe('GET /api/analyses/kpi', () => {
  test('月指定で基本項目が数値として返る', async () => {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const res = await request(app)
      .get('/api/analyses/kpi')
      .query({ month });

    expect(res.status).toBe(200);
    const body = res.body || {};

    const keys = [
      'sales',
      'grossProfit',
      'grossProfitRate',
      'customerCount',
      'newCustomersCount',
      'cancelledCustomersCount',
      'salesGrowthRate',
      'customerUnitPrice',
      'churnRate',
    ];

    for (const k of keys) {
      expect(typeof body[k]).toBe('number');
    }
  });
});
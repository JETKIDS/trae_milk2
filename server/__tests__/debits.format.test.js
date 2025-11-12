const request = require('supertest');
const iconv = require('iconv-lite');
const app = require('../index');
const { initSchema } = require('./helpers/dbSetup');
const { getDB } = require('../connection');

beforeAll(async () => {
  initSchema();
  await new Promise((resolve, reject) => {
    const db = getDB();
    db.all("PRAGMA table_info(customers)", [], (err, cols) => {
      if (err) { return reject(err); }
      const names = cols.map(c => c.name);
      if (!names.includes('delivery_order')) {
        db.run('ALTER TABLE customers ADD COLUMN delivery_order INTEGER DEFAULT 0', [], (e) => {
          if (e) { db.close(); reject(e); }
          else { db.close(); resolve(); }
        });
      } else {
        db.close();
        resolve();
      }
    });
  });
});

describe('GET /api/debits/generate (zengin_fixed)', () => {
  test('固定長（CP932）の1行が120桁である', async () => {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM

    // supertestでバイナリをbufferとして受け取るパーサーを指定
    const res = await request(app)
      .get('/api/debits/generate')
      .query({ month, format: 'zengin_fixed' })
      .buffer(true)
      .parse((resp, callback) => {
        const data = [];
        resp.on('data', chunk => data.push(chunk));
        resp.on('end', () => callback(null, Buffer.concat(data)));
      });

    if (res.status !== 200) {
      // デバッグ: エラー内容を表示
      try {
        console.log('debits.generate error:', res.status, res.body && res.body.toString());
      } catch {}
    }
    expect(res.status).toBe(200);

    const buf = res.body; // Buffer
    const text = iconv.decode(Buffer.from(buf), 'CP932');
    const lines = text.split(/\r?\n/).filter(Boolean);

    expect(lines.length).toBeGreaterThanOrEqual(1); // ヘッダー行は常に生成される想定
    expect(lines[0].length).toBe(120);
    if (lines.length > 1) {
      expect(lines.slice(1).every(l => l.length === 120)).toBe(true);
    }
  });
});
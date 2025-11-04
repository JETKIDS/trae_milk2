const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9000;

// ミドルウェア
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// リクエストログミドルウェア
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 リクエストボディ:', req.body);
  }
  next();
});

// APIルート
app.use('/api/masters', require('./routes/masters'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/products', require('./routes/products'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/delivery-patterns', require('./routes/deliveryPatterns'));
app.use('/api/temporary-changes', require('./routes/temporaryChanges'));
app.use('/api/bulk-update', require('./routes/bulkUpdate'));
// 口座振替（全銀協）ファイルプレビュー
app.use('/api/debits', require('./routes/debits'));

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// 404ハンドラ（APIのみ）
app.use('/api', (req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// 共通エラーハンドリング
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
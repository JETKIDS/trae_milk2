const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// NODE_ENV が test のときはテスト用DBファイルを使用し、
// 本番・開発時は従来のファイルを使用する
const dbFileName = process.env.NODE_ENV === 'test' ? 'milk_delivery.test.db' : 'milk_delivery.db';
const dbPath = path.join(__dirname, dbFileName);

function getDB() {
  return new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('データベース接続エラー:', err.message);
    }
  });
}

module.exports = { getDB };
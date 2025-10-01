const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');

function getDB() {
  return new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('データベース接続エラー:', err.message);
    }
  });
}

module.exports = { getDB };
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

function columnExists(tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName});`, (err, rows) => {
      if (err) return reject(err);
      const exists = rows.some(r => r.name === columnName);
      resolve(exists);
    });
  });
}

async function migrate() {
  try {
    console.log('顧客テーブルに「よみがな」(yomi)列を追加します...');
    const exists = await columnExists('customers', 'yomi');
    if (exists) {
      console.log('yomi列は既に存在します。マイグレーションは不要です。');
    } else {
      await new Promise((resolve, reject) => {
        db.run(`ALTER TABLE customers ADD COLUMN yomi TEXT;`, (err) => {
          if (err) return reject(err);
          resolve(null);
        });
      });
      console.log('yomi列を追加しました。');
    }
  } catch (error) {
    console.error('マイグレーション中にエラーが発生しました:', error);
  } finally {
    db.close();
  }
}

migrate();
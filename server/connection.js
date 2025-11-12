const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// NODE_ENV が test のときはテスト用DBファイルを使用し、
// 本番・開発時は従来のファイルを使用する
const dbFileName = process.env.NODE_ENV === 'test' ? 'milk_delivery.test.db' : 'milk_delivery.db';
const dbPath = path.join(__dirname, dbFileName);

let singletonDb = null;

function createDatabase() {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('データベース接続エラー:', err.message);
    }
  });
  // 同時アクセスを許容し、テーブル整合性を保つ
  db.serialize(() => {
    try {
      db.run('PRAGMA journal_mode = WAL');
      db.run('PRAGMA foreign_keys = ON');
    } catch (e) {
      // PRAGMA失敗は致命的ではないためログのみ
      console.warn('PRAGMA設定エラー:', e && e.message);
    }
  });
  return db;
}

function getDB() {
  // テスト環境ではシングルトンを使い、closeを無効化してSQLITE_MISUSEを防ぐ
  if (process.env.NODE_ENV === 'test') {
    if (!singletonDb) {
      singletonDb = createDatabase();
      // closeを無効化（テスト時のみ）
      const originalClose = singletonDb.close.bind(singletonDb);
      singletonDb.close = function noOpClose(callback) {
        if (typeof callback === 'function') callback(null);
        // 実際には閉じない。必要ならプロセス終了時に閉じる。
        return this;
      };
      // プロセス終了時に安全にクローズ
      process.once('exit', () => {
        try { originalClose(); } catch {}
      });
    }
    return singletonDb;
  }

  // 開発・本番は都度接続（既存の挙動を保持）
  return createDatabase();
}

module.exports = { getDB };
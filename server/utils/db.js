const { getDB } = require('../connection');

const toPromise = (fn, db, sql, params = []) => new Promise((resolve, reject) => {
  fn.call(db, sql, params, function callback(err, result) {
    if (err) {
      return reject(err);
    }
    if (typeof result === 'undefined') {
      resolve(this);
    } else {
      resolve(result);
    }
  });
});

const dbAll = (db, sql, params = []) => toPromise(db.all, db, sql, params);
const dbGet = (db, sql, params = []) => toPromise(db.get, db, sql, params);
const dbRun = (db, sql, params = []) => toPromise(db.run, db, sql, params);
const dbExec = (db, sql) => new Promise((resolve, reject) => {
  db.exec(sql, (err) => {
    if (err) {
      return reject(err);
    }
    resolve();
  });
});

const withDb = async (workFn) => {
  const db = getDB();
  try {
    return await workFn(db);
  } finally {
    db.close();
  }
};

module.exports = {
  withDb,
  dbAll,
  dbGet,
  dbRun,
  dbExec,
};


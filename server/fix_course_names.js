const { getDB } = require('./connection');

// 修正したいコース名・説明（UTF-8で保存）
const UPDATES = [
  { id: 1, course_name: 'コースA', description: '金沢市中心部', custom_id: '001' },
  { id: 2, course_name: 'コースB', description: '金沢市東部', custom_id: '002' },
  { id: 3, course_name: 'コースC', description: '金沢市西部', custom_id: '003' },
  { id: 4, course_name: 'コースD', description: '月曜・木曜配達', custom_id: '004' },
  { id: 5, course_name: 'コースE', description: '火曜・金曜配達', custom_id: '005' },
  { id: 6, course_name: 'コースF', description: '水曜・土曜配達', custom_id: '006' },
];

function run() {
  const db = getDB();
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    for (const u of UPDATES) {
      db.run(
        'UPDATE delivery_courses SET course_name = ?, description = ?, custom_id = ? WHERE id = ?',
        [u.course_name, u.description, u.custom_id, u.id],
        (err) => {
          if (err) console.error(`更新エラー id=${u.id}:`, err.message);
          else console.log(`更新完了 id=${u.id}: ${u.custom_id} ${u.course_name}`);
        }
      );
    }
    db.run('COMMIT', (err) => {
      if (err) console.error('コミットエラー:', err.message);
      else console.log('全コースの名称・説明の修正を完了しました');
      db.close();
    });
  });
}

run();
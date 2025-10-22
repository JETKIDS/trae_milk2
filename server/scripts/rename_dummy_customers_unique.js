/**
 * ダミー顧客の姓名重複を解消するための一括リネームスクリプト
 * - DB内の customers を id 昇順で取得し、用意した 60 件のユニークな氏名に順番に置き換えます
 * - 同時に yomi（ひらがな）も更新します
 * - 顧客数が 60 を超える場合は、61件目以降に対しては末尾に連番を付加してユニーク化します（例: "山田はるか_61"）
 *
 * 実行方法（プロジェクトルート）:
 *   node server/scripts/rename_dummy_customers_unique.js
 */
const { getDB } = require('../connection');

// 60件分のユニーク氏名（yomi付き）
const UNIQUE_CUSTOMERS = [
  { name: '佐藤一朗', yomi: 'さとういちろう' },
  { name: '鈴木花子', yomi: 'すずきはなこ' },
  { name: '高橋健太', yomi: 'たかはしけんた' },
  { name: '田中美咲', yomi: 'たなかみさき' },
  { name: '伊藤大輔', yomi: 'いとうだいすけ' },
  { name: '山本綾香', yomi: 'やまもとあやか' },
  { name: '中村拓也', yomi: 'なかむらたくや' },
  { name: '小林優子', yomi: 'こばやしゆうこ' },
  { name: '加藤慎一', yomi: 'かとうしんいち' },
  { name: '吉田香織', yomi: 'よしだかおり' },
  { name: '山田修平', yomi: 'やまだしゅうへい' },
  { name: '佐々木美穂', yomi: 'ささきみほ' },
  { name: '山口隆志', yomi: 'やまぐちたかし' },
  { name: '松本千春', yomi: 'まつもとちはる' },
  { name: '井上亮太', yomi: 'いのうえりょうた' },
  { name: '斎藤理恵', yomi: 'さいとうりえ' },
  { name: '木村健二', yomi: 'きむらけんじ' },
  { name: '林光男', yomi: 'はやしみつお' },
  { name: '清水奈々', yomi: 'しみずなな' },
  { name: '山崎和也', yomi: 'やまざきかずや' },
  { name: '森さくら', yomi: 'もりさくら' },
  { name: '池田大樹', yomi: 'いけだだいき' },
  { name: '橋本美月', yomi: 'はしもとみづき' },
  { name: '阿部陽葵', yomi: 'あべひまり' },
  { name: '石川想太', yomi: 'いしかわそうた' },
  { name: '山下湊', yomi: 'やましたみなと' },
  { name: '中島つむぎ', yomi: 'なかじまつむぎ' },
  { name: '前田こはる', yomi: 'まえだこはる' },
  { name: '藤田さやか', yomi: 'ふじたさやか' },
  { name: '小川直樹', yomi: 'おがわなおき' },
  { name: '後藤智子', yomi: 'ごとうともこ' },
  { name: '岡田彩乃', yomi: 'おかだあやの' },
  { name: '長谷川美紀', yomi: 'はせがわみき' },
  { name: '村上直美', yomi: 'むらかみなおみ' },
  { name: '石井翔太', yomi: 'いしいしょうた' },
  { name: '渡辺浩二', yomi: 'わたなべこうじ' },
  { name: '長田美穂子', yomi: 'ながたみほこ' },
  { name: '青木悠斗', yomi: 'あおきゆうと' },
  { name: '佐野陽菜', yomi: 'さのひな' },
  { name: '西田凛', yomi: 'にしだりん' },
  { name: '原口颯太', yomi: 'はらぐちそうた' },
  { name: '平野ひかり', yomi: 'ひらのひかり' },
  { name: '藤井航太', yomi: 'ふじいこうた' },
  { name: '野田実里', yomi: 'のだみのり' },
  { name: '黒田海斗', yomi: 'くろだかいと' },
  { name: '白石菜々子', yomi: 'しらいしななこ' },
  { name: '宮本結衣', yomi: 'みやもとゆい' },
  { name: '秋山陽介', yomi: 'あきやまようすけ' },
  { name: '吉岡拓海', yomi: 'よしおかたくみ' },
  { name: '金子悠真', yomi: 'かねこゆうま' },
  { name: '高木美優', yomi: 'たかぎみゆう' },
  { name: '柴田大樹', yomi: 'しばただいき' },
  { name: '安藤美月', yomi: 'あんどうみづき' },
  { name: '川口陽葵', yomi: 'かわぐちひまり' },
  { name: '内藤想太', yomi: 'ないとうそうた' },
  { name: '加瀬湊', yomi: 'かせみなと' },
  { name: '熊谷つむぎ', yomi: 'くまがいつむぎ' },
  { name: '桜井こはる', yomi: 'さくらいこはる' }
];

async function main() {
  const db = getDB();
  try {
    console.log('--- 顧客名のユニーク化を開始します ---');
    await new Promise((resolve, reject) => db.exec('BEGIN TRANSACTION', err => err ? reject(err) : resolve()));

    const customers = await new Promise((resolve, reject) => {
      db.all('SELECT id, customer_name FROM customers ORDER BY id ASC', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    console.log(`対象顧客数: ${customers.length}`);

    const stmt = await new Promise((resolve, reject) => {
      const s = db.prepare('UPDATE customers SET customer_name = ?, yomi = ? WHERE id = ?');
      s ? resolve(s) : reject(new Error('prepare failed'));
    });

    for (let i = 0; i < customers.length; i++) {
      const cust = customers[i];
      let target;
      if (i < UNIQUE_CUSTOMERS.length) {
        target = UNIQUE_CUSTOMERS[i];
      } else {
        // 61件目以降は既存の最後の名前に連番を付加（yomiも連番を付加）
        const base = UNIQUE_CUSTOMERS[UNIQUE_CUSTOMERS.length - 1];
        const suffix = `_${i+1}`;
        target = { name: `${base.name}${suffix}`, yomi: `${base.yomi}${suffix}` };
      }
      await new Promise((resolve, reject) => {
        stmt.run([target.name, target.yomi, cust.id], function(err) {
          if (err) return reject(err);
          resolve();
        });
      });
      console.log(`更新: id=${cust.id}, '${cust.customer_name}' -> '${target.name}'`);
    }

    await new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve()));
    await new Promise((resolve, reject) => db.exec('COMMIT', err => err ? reject(err) : resolve()));
    console.log('--- 顧客名のユニーク化が完了しました ---');
  } catch (e) {
    console.error('エラーが発生しました:', e);
    try { await new Promise((resolve) => db.exec('ROLLBACK', () => resolve())); } catch (_) {}
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
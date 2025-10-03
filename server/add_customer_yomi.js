const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

// カタカナをひらがなに変換
function katakanaToHiragana(input) {
  return input.replace(/[\u30A1-\u30F6]/g, (ch) => {
    return String.fromCharCode(ch.charCodeAt(0) - 0x60);
  });
}

// 既知のダミー顧客のよみがな辞書（必要に応じて拡張）
const yomiDict = {
  '田中太郎': 'たなかたろう',
  '佐藤花子': 'さとうはなこ',
  '鈴木一郎': 'すずきいちろう',
  '高橋美咲': 'たかはしみさき',
  '伊藤健太': 'いとうけんた',
  '山田由美': 'やまだゆみ',
  '中村正樹': 'なかむらまさき',
  '小林恵子': 'こばやしけいこ',
  '加藤雄介': 'かとうゆうすけ',
  '吉田真理': 'よしだまり',
  '松本和也': 'まつもとかずや',
  '井上さくら': 'いのうえさくら',
  '木村大輔': 'きむらだいすけ',
  '斉藤麻衣': 'さいとうまい',
  '清水博文': 'しみずひろふみ',
  '森田愛美': 'もりたまなみ',
  '橋本拓也': 'はしもとたくや',
  '石川優子': 'いしかわゆうこ',
  '前田慎一': 'まえだしんいち',
  '藤田香織': 'ふじたかおり',
  '岡田修平': 'おかだしゅうへい',
  '長谷川美穂': 'はせがわみほ',
  '村上隆志': 'むらかみたかし',
  '近藤千春': 'こんどうちはる',
  '後藤亮太': 'ごとうりょうた',
  '内田理恵': 'うちだりえ',
  '坂本健二': 'さかもとけんじ',
  '三浦綾香': 'みうらあやか',
  '西村光男': 'にしむらみつお',
  '原田奈々': 'はらだなな',
};

async function addYomi() {
  console.log('既存顧客によみがなを付与します...');
  try {
    // まず yomi 列が存在するか確認
    const tableInfo = await new Promise((resolve, reject) => {
      db.all(`PRAGMA table_info(customers);`, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    const hasYomi = tableInfo.some(r => r.name === 'yomi');
    if (!hasYomi) {
      await new Promise((resolve, reject) => {
        db.run(`ALTER TABLE customers ADD COLUMN yomi TEXT;`, (err) => {
          if (err) return reject(err);
          resolve(null);
        });
      });
      console.log('yomi列が存在しなかったため、追加しました。');
    }

    const customers = await new Promise((resolve, reject) => {
      db.all(`SELECT id, customer_name FROM customers;`, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    let updated = 0;
    for (const c of customers) {
      let yomi = yomiDict[c.customer_name];
      if (!yomi) {
        // カタカナのみの名前であればひらがなに変換
        const kanaOnly = /^[\u3040-\u309F\u30A0-\u30FF\s・ー]+$/.test(c.customer_name);
        if (kanaOnly) {
          yomi = katakanaToHiragana(c.customer_name).replace(/\s/g, '');
        }
      }

      if (yomi) {
        await new Promise((resolve, reject) => {
          db.run(`UPDATE customers SET yomi = ? WHERE id = ?;`, [yomi, c.id], (err) => {
            if (err) return reject(err);
            resolve(null);
          });
        });
        updated++;
      }
    }

    console.log(`よみがなを付与しました: ${updated} / ${customers.length}`);
  } catch (error) {
    console.error('よみがな付与中にエラーが発生しました:', error);
  } finally {
    db.close();
  }
}

addYomi();
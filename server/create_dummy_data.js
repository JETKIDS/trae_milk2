const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルのパス
const dbPath = path.join(__dirname, 'milk_delivery.db');

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err.message);
    return;
  }
  console.log('データベースに接続しました');
});

// ダミー商品データ（10種類）
const dummyProducts = [
  { name: '特選牛乳', unit: '本', price: 300, description: '新鮮な特選牛乳です' },
  { name: 'プレーンヨーグルト', unit: '個', price: 250, description: 'なめらかなプレーンヨーグルト' },
  { name: 'フルーツヨーグルト', unit: '個', price: 280, description: 'フルーツ入りヨーグルト' },
  { name: 'カマンベールチーズ', unit: '個', price: 500, description: 'クリーミーなカマンベールチーズ' },
  { name: 'モッツァレラチーズ', unit: '個', price: 450, description: 'フレッシュなモッツァレラチーズ' },
  { name: '生クリーム', unit: '本', price: 400, description: '濃厚な生クリーム' },
  { name: 'バター', unit: '個', price: 350, description: '無塩バター' },
  { name: '低脂肪牛乳', unit: '本', price: 280, description: 'ヘルシーな低脂肪牛乳' },
  { name: 'カルシウム牛乳', unit: '本', price: 320, description: 'カルシウム強化牛乳' },
  { name: 'アイスクリーム', unit: '個', price: 200, description: 'バニラアイスクリーム' }
];

// ダミー顧客データ（30件）
const dummyCustomers = [
  // コースA用（10件）- 月曜・木曜
  { name: '田中太郎', address: '東京都渋谷区神南1-1-1', phone: '03-1234-5678', email: 'tanaka@example.com', course: 'A' },
  { name: '佐藤花子', address: '東京都新宿区歌舞伎町1-2-3', phone: '03-2345-6789', email: 'sato@example.com', course: 'A' },
  { name: '鈴木一郎', address: '東京都品川区大崎1-3-4', phone: '03-3456-7890', email: 'suzuki@example.com', course: 'A' },
  { name: '高橋美咲', address: '東京都港区六本木2-4-5', phone: '03-4567-8901', email: 'takahashi@example.com', course: 'A' },
  { name: '伊藤健太', address: '東京都中央区銀座3-5-6', phone: '03-5678-9012', email: 'ito@example.com', course: 'A' },
  { name: '山田由美', address: '東京都千代田区丸の内4-6-7', phone: '03-6789-0123', email: 'yamada@example.com', course: 'A' },
  { name: '中村正樹', address: '東京都台東区浅草5-7-8', phone: '03-7890-1234', email: 'nakamura@example.com', course: 'A' },
  { name: '小林恵子', address: '東京都墨田区押上6-8-9', phone: '03-8901-2345', email: 'kobayashi@example.com', course: 'A' },
  { name: '加藤雄介', address: '東京都江東区豊洲7-9-10', phone: '03-9012-3456', email: 'kato@example.com', course: 'A' },
  { name: '吉田真理', address: '東京都目黒区自由が丘8-10-11', phone: '03-0123-4567', email: 'yoshida@example.com', course: 'A' },
  
  // コースB用（10件）- 火曜・金曜
  { name: '松本和也', address: '東京都世田谷区三軒茶屋1-11-12', phone: '03-1111-2222', email: 'matsumoto@example.com', course: 'B' },
  { name: '井上さくら', address: '東京都杉並区荻窪2-12-13', phone: '03-2222-3333', email: 'inoue@example.com', course: 'B' },
  { name: '木村大輔', address: '東京都練馬区石神井3-13-14', phone: '03-3333-4444', email: 'kimura@example.com', course: 'B' },
  { name: '斉藤麻衣', address: '東京都中野区中野4-14-15', phone: '03-4444-5555', email: 'saito@example.com', course: 'B' },
  { name: '清水博文', address: '東京都豊島区池袋5-15-16', phone: '03-5555-6666', email: 'shimizu@example.com', course: 'B' },
  { name: '森田愛美', address: '東京都北区赤羽6-16-17', phone: '03-6666-7777', email: 'morita@example.com', course: 'B' },
  { name: '橋本拓也', address: '東京都板橋区板橋7-17-18', phone: '03-7777-8888', email: 'hashimoto@example.com', course: 'B' },
  { name: '石川優子', address: '東京都足立区北千住8-18-19', phone: '03-8888-9999', email: 'ishikawa@example.com', course: 'B' },
  { name: '前田慎一', address: '東京都葛飾区亀有9-19-20', phone: '03-9999-0000', email: 'maeda@example.com', course: 'B' },
  { name: '藤田香織', address: '東京都江戸川区小岩10-20-21', phone: '03-0000-1111', email: 'fujita@example.com', course: 'B' },
  
  // コースC用（10件）- 水曜・土曜
  { name: '岡田修平', address: '神奈川県横浜市西区みなとみらい1-21-22', phone: '045-1111-2222', email: 'okada@example.com', course: 'C' },
  { name: '長谷川美穂', address: '神奈川県川崎市川崎区駅前2-22-23', phone: '044-2222-3333', email: 'hasegawa@example.com', course: 'C' },
  { name: '村上隆志', address: '神奈川県相模原市中央区相模原3-23-24', phone: '042-3333-4444', email: 'murakami@example.com', course: 'C' },
  { name: '近藤千春', address: '神奈川県藤沢市藤沢4-24-25', phone: '0466-4444-5555', email: 'kondo@example.com', course: 'C' },
  { name: '後藤亮太', address: '神奈川県平塚市平塚5-25-26', phone: '0463-5555-6666', email: 'goto@example.com', course: 'C' },
  { name: '内田理恵', address: '神奈川県茅ヶ崎市茅ヶ崎6-26-27', phone: '0467-6666-7777', email: 'uchida@example.com', course: 'C' },
  { name: '坂本健二', address: '神奈川県小田原市小田原7-27-28', phone: '0465-7777-8888', email: 'sakamoto@example.com', course: 'C' },
  { name: '三浦綾香', address: '神奈川県大和市大和8-28-29', phone: '046-8888-9999', email: 'miura@example.com', course: 'C' },
  { name: '西村光男', address: '神奈川県座間市座間9-29-30', phone: '046-9999-0000', email: 'nishimura@example.com', course: 'C' },
  { name: '原田奈々', address: '神奈川県海老名市海老名10-30-31', phone: '046-0000-1111', email: 'harada@example.com', course: 'C' }
];

// 商品を挿入する関数
function insertProducts() {
  return new Promise((resolve, reject) => {
    console.log('商品データを挿入中...');
    
    // まず、メーカーを挿入
    const manufacturerStmt = db.prepare(`
      INSERT INTO manufacturers (manufacturer_name, contact_info, created_at)
      VALUES (?, ?, datetime('now'))
    `);
    
    manufacturerStmt.run(['牛乳屋さん', '03-1234-5678'], function(err) {
      if (err) {
        console.error('メーカー挿入エラー:', err.message);
        reject(err);
        return;
      }
      
      const manufacturerId = this.lastID;
      console.log(`メーカー挿入完了: ID ${manufacturerId}`);
      manufacturerStmt.finalize();
      
      // 商品を挿入
      const stmt = db.prepare(`
        INSERT INTO products (product_name, manufacturer_id, unit_price, unit, description, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);
      
      let completed = 0;
      const total = dummyProducts.length;
      
      dummyProducts.forEach((product, index) => {
        stmt.run([product.name, manufacturerId, product.price, product.unit, product.description], function(err) {
          if (err) {
            console.error(`商品挿入エラー (${index + 1}):`, err.message);
            reject(err);
            return;
          }
          
          completed++;
          console.log(`商品挿入完了: ${product.name} (${completed}/${total})`);
          
          if (completed === total) {
            stmt.finalize();
            console.log('全商品の挿入が完了しました');
            resolve();
          }
        });
      });
    });
  });
}

// 顧客を挿入する関数
function insertCustomers() {
  return new Promise((resolve, reject) => {
    console.log('顧客データを挿入中...');
    
    // まず、コースを挿入
    const courseStmt = db.prepare(`
      INSERT INTO delivery_courses (course_name, description, created_at)
      VALUES (?, ?, datetime('now'))
    `);
    
    const courses = [
      { name: 'コースA', description: '月曜・木曜配達' },
      { name: 'コースB', description: '火曜・金曜配達' },
      { name: 'コースC', description: '水曜・土曜配達' }
    ];
    
    let courseCompleted = 0;
    const courseIds = {};
    
    courses.forEach((course, index) => {
      courseStmt.run([course.name, course.description], function(err) {
        if (err) {
          console.error(`コース挿入エラー (${index + 1}):`, err.message);
          reject(err);
          return;
        }
        
        courseIds[course.name] = this.lastID;
        courseCompleted++;
        console.log(`コース挿入完了: ${course.name} (ID: ${this.lastID})`);
        
        if (courseCompleted === courses.length) {
          courseStmt.finalize();
          
          // 顧客を挿入
          const stmt = db.prepare(`
            INSERT INTO customers (customer_name, address, phone, email, course_id, contract_start_date, created_at)
            VALUES (?, ?, ?, ?, ?, '2025-09-01', datetime('now'))
          `);
          
          let completed = 0;
          const total = dummyCustomers.length;
          const customerIds = [];
          
          dummyCustomers.forEach((customer, index) => {
            const courseId = courseIds[`コース${customer.course}`];
            stmt.run([customer.name, customer.address, customer.phone, customer.email, courseId], function(err) {
              if (err) {
                console.error(`顧客挿入エラー (${index + 1}):`, err.message);
                reject(err);
                return;
              }
              
              customerIds[index] = this.lastID;
              completed++;
              console.log(`顧客挿入完了: ${customer.name} (ID: ${this.lastID}) (${completed}/${total})`);
              
              if (completed === total) {
                stmt.finalize();
                console.log('全顧客の挿入が完了しました');
                resolve(customerIds);
              }
            });
          });
        }
      });
    });
  });
}

// 配達パターンを挿入する関数
function insertDeliveryPatterns(customerIds) {
  return new Promise((resolve, reject) => {
    console.log('配達パターンを挿入中...');
    
    const stmt = db.prepare(`
      INSERT INTO delivery_patterns (customer_id, product_id, quantity, delivery_days, daily_quantities, unit_price, start_date, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '2025-09-01', 1, datetime('now'), datetime('now'))
    `);
    
    let completed = 0;
    let totalPatterns = 0;
    
    // 各顧客に対して配達パターンを作成
    customerIds.forEach((customerId, index) => {
      const customer = dummyCustomers[index];
      let deliveryDays;
      let dailyQuantities = {};
      
      // コースに応じて配達曜日を設定
      switch (customer.course) {
        case 'A':
          deliveryDays = '[1,4]'; // 月曜(1)、木曜(4)
          break;
        case 'B':
          deliveryDays = '[2,5]'; // 火曜(2)、金曜(5)
          break;
        case 'C':
          deliveryDays = '[3,6]'; // 水曜(3)、土曜(6)
          break;
      }
      
      // 各顧客に2-3種類の商品をランダムに割り当て
      const numProducts = Math.floor(Math.random() * 2) + 2; // 2-3種類
      const selectedProducts = [];
      
      for (let i = 0; i < numProducts; i++) {
        let productId;
        do {
          productId = Math.floor(Math.random() * 10) + 1; // 1-10の商品ID
        } while (selectedProducts.includes(productId));
        
        selectedProducts.push(productId);
        const quantity = Math.floor(Math.random() * 3) + 1; // 1-3個
        
        // 曜日ごとの数量を設定
        const days = JSON.parse(deliveryDays);
        days.forEach(day => {
          dailyQuantities[day] = quantity;
        });
        
        // 商品の単価を取得（ダミーデータから）
        const product = dummyProducts[productId - 1];
        const unitPrice = product ? product.price : 300;
        
        totalPatterns++;
        
        stmt.run([customerId, productId, quantity, deliveryDays, JSON.stringify(dailyQuantities), unitPrice], function(err) {
          if (err) {
            console.error(`配達パターン挿入エラー:`, err.message);
            reject(err);
            return;
          }
          
          completed++;
          console.log(`配達パターン挿入完了: 顧客ID ${customerId}, 商品ID ${productId}, コース${customer.course} (${completed}/${totalPatterns})`);
          
          if (completed === totalPatterns) {
            stmt.finalize();
            console.log('全配達パターンの挿入が完了しました');
            resolve();
          }
        });
        
        // 次の商品のために dailyQuantities をリセット
        dailyQuantities = {};
      }
    });
  });
}

// メイン実行関数
async function createDummyData() {
  try {
    console.log('=== ダミーデータ作成開始 ===');
    
    // 1. 商品データを挿入
    await insertProducts();
    
    // 2. 顧客データを挿入
    const customerIds = await insertCustomers();
    
    // 3. 配達パターンを挿入
    await insertDeliveryPatterns(customerIds);
    
    console.log('=== ダミーデータ作成完了 ===');
    console.log(`作成されたデータ:`);
    console.log(`- 商品: ${dummyProducts.length}種類`);
    console.log(`- 顧客: ${dummyCustomers.length}件`);
    console.log(`- コースA (月・木): 10件`);
    console.log(`- コースB (火・金): 10件`);
    console.log(`- コースC (水・土): 10件`);
    console.log(`- 契約開始日: 2025-09-01`);
    
  } catch (error) {
    console.error('ダミーデータ作成エラー:', error);
  } finally {
    // データベース接続を閉じる
    db.close((err) => {
      if (err) {
        console.error('データベース切断エラー:', err.message);
      } else {
        console.log('データベース接続を閉じました');
      }
    });
  }
}

// スクリプト実行
createDummyData();
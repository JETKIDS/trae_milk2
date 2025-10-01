const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milk_delivery.db');
const db = new sqlite3.Database(dbPath);

console.log('データベースを初期化しています...');

db.serialize(() => {
  // テーブル作成
  db.run(`CREATE TABLE IF NOT EXISTS delivery_courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_id TEXT UNIQUE,
    course_name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS delivery_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    course_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES delivery_courses(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS manufacturers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manufacturer_name TEXT NOT NULL,
    contact_info TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_id TEXT UNIQUE,
    product_name TEXT NOT NULL,
    manufacturer_id INTEGER,
    unit_price DECIMAL(10,2) NOT NULL,
    unit TEXT DEFAULT 'ml',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_id TEXT UNIQUE,
    customer_name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    course_id INTEGER,
    staff_id INTEGER,
    contract_start_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES delivery_courses(id),
    FOREIGN KEY (staff_id) REFERENCES delivery_staff(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS delivery_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    product_id INTEGER,
    delivery_days TEXT, -- JSON形式で曜日を保存 (例: "[1,3,5]" = 月水金)
    quantity INTEGER DEFAULT 1, -- 後方互換性のため残す
    daily_quantities TEXT, -- JSON形式で曜日ごとの数量を保存 (例: "{\"1\":3,\"3\":2,\"5\":4}")
    unit_price DECIMAL(10,2) NOT NULL,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS temporary_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    change_date DATE NOT NULL,
    change_type TEXT NOT NULL CHECK(change_type IN ('skip', 'add', 'modify')),
    product_id INTEGER,
    quantity INTEGER,
    unit_price DECIMAL(10,2),
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  // サンプルデータ挿入
  console.log('サンプルデータを挿入しています...');

  // 配達コース
  db.run(`INSERT OR IGNORE INTO delivery_courses (id, custom_id, course_name, description) VALUES 
    (1, 'COURSE-A', 'Aコース', '金沢市中心部'),
    (2, 'COURSE-B', 'Bコース', '金沢市東部'),
    (3, 'COURSE-C', 'Cコース', '金沢市西部')`);

  // 配達スタッフ
  db.run(`INSERT OR IGNORE INTO delivery_staff (id, staff_name, phone, course_id) VALUES 
    (1, '田中 一郎', '076-123-4567', 1),
    (2, '佐藤 花子', '076-234-5678', 2),
    (3, '鈴木 太郎', '076-345-6789', 3)`);

  // メーカー
  db.run(`INSERT OR IGNORE INTO manufacturers (id, manufacturer_name, contact_info) VALUES 
    (1, '森永乳業', '連絡先: 0120-369-744'),
    (2, '明治', '連絡先: 0120-598-369'),
    (3, '雪印メグミルク', '連絡先: 0120-301-369')`);

  // 商品
  db.run(`INSERT OR IGNORE INTO products (id, custom_id, product_name, manufacturer_id, unit_price, unit) VALUES 
    (1, '0001', '森永牛乳', 1, 180, '180ml'),
    (2, '0002', '明治おいしい牛乳', 2, 200, '200ml'),
    (3, '0003', '雪印メグミルク牛乳', 3, 190, '200ml'),
    (4, '0004', 'ヨーグルト', 2, 120, '100g')`);

  // 顧客
  db.run(`INSERT OR IGNORE INTO customers (id, custom_id, customer_name, address, phone, course_id, staff_id, contract_start_date) VALUES 
    (1, '0001', '金沢 太郎', '石川県金沢市広坂1-1-1', '076-123-4567', 1, 1, '2025-01-01'),
    (2, '0002', '加賀 花子', '石川県金沢市香林坊2-2-2', '076-234-5678', 1, 1, '2025-01-15'),
    (3, '0003', '能登 次郎', '石川県金沢市片町3-3-3', '076-345-6789', 2, 2, '2025-02-01')`);

  // 配達パターン
  db.run(`INSERT OR IGNORE INTO delivery_patterns (customer_id, product_id, delivery_days, quantity, unit_price, start_date) VALUES 
    (1, 1, '[1,3,5]', 1, 180, '2025-01-01'),
    (1, 4, '[0,6]', 1, 120, '2025-01-01'),
    (2, 2, '[1,2,3,4,5]', 1, 200, '2025-01-15'),
    (3, 3, '[1,3,5]', 2, 190, '2025-02-01')`);

  // 臨時変更のサンプルデータ
  db.run(`INSERT OR IGNORE INTO temporary_changes (customer_id, change_date, change_type, product_id, quantity, unit_price, reason) VALUES 
    (1, '2025-01-10', 'skip', NULL, NULL, NULL, '旅行のため'),
    (2, '2025-01-20', 'add', 4, 1, 120, 'ヨーグルト追加'),
    (3, '2025-02-05', 'modify', 3, 3, 190, '数量変更')`);

  console.log('データベースの初期化が完了しました！');
});

db.close();
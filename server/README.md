# サーバー実装メモ（2025年11月版）

## 1. 概要
- ランタイム: Node.js 18 / Express 4
- データベース: SQLite (`milk_delivery.db`)
- 役割: 顧客・配達パターン・臨時変更・請求・入金を REST API で提供
- 主要エントリポイント: `index.js`
  - `npm run dev` で nodemon 起動（ポート 9000）

## 2. ディレクトリ構成
```
server/
├── routes/               # Express ルート定義
│   ├── customers/        # 顧客・請求・入金関連 API
│   ├── delivery.js       # 配達リスト API 等
│   └── ...
├── services/             # ビジネスロジック層
│   ├── customerService.js
│   ├── customerLedgerService.js
│   ├── customerPaymentService.js
│   ├── customerCalendarService.js
│   └── ...
├── utils/                # DB ラッパーなど
├── scripts/              # データ調整・移行スクリプト
├── tests/                # Jest テスト
└── milk_delivery.db      # SQLite DB（本番/検証共通）
```

## 3. 主なデータモデル

| テーブル | 用途 | 主なカラム |
|----------|------|------------|
| `customers` | 顧客基本情報 | id, custom_id, customer_name, address, phone, course_id 等 |
| `delivery_patterns` | 定期配達パターン | product_id, delivery_days, daily_quantities, unit_price, start_date, end_date |
| `temporary_changes` | 臨時変更 | change_type（skip/add/modify）, quantity, change_date |
| `ar_invoices` | 月次請求 | year, month, amount, rounding_enabled, status, confirmed_at |
| `ar_payments` | 入金 | year, month, amount, method, note |
| その他 | 商品 (`products`)、メーカー (`manufacturers`)、コース (`delivery_courses`) など |

## 4. API ハイライト

### 4.1 顧客・カレンダー
- `GET /api/customers/:id` – 顧客詳細 + パターン情報
- `GET /api/customers/:id/calendar/:year/:month` – 月次カレンダーと臨時変更
- `PUT /api/delivery-patterns/:id` – パターン更新（終了日変更・単価変更など）
- `POST /api/temporary-changes` – 臨時変更の登録

### 4.2 請求・入金
- `POST /api/customers/:id/invoices/confirm` – 月次請求確定
- `POST /api/customers/:id/invoices/unconfirm` – 月次請求確定解除
- `GET  /api/customers/:id/invoices/status` – 確定状態の取得
- `GET  /api/customers/:id/ar-summary` – 前月請求額・当月入金・繰越を返却
- `POST /api/customers/:id/payments` – 入金登録（集金/口座振替）
- `GET  /api/customers/:id/payments` – 入金履歴

### 4.3 一括入金サポート
- `GET /api/customers/by-course/:courseId/invoices-amounts` – 前月請求額＆確定状況
- `GET /api/customers/by-course/:courseId/payments-sum` – 指定月入金合計
- `POST /api/customers/payments/batch` – コース単位の一括入金登録

### 4.4 マスター情報
- `GET /api/masters/courses` などで配達コース・スタッフ等を取得
- マスター更新用 API は段階的に整備中

## 5. 請求ロジック補足
- 繰越額 = 前月請求額（確定済みが優先） - 当月入金額
- 過入金はマイナス値として `carryover_amount` に保存し、翌月に繰り越す
- 確定済み月は顧客詳細で編集不可（フロント側で背景色を変更）
- `customerLedgerService.js` に請求計算・繰越算出ロジックを集約

## 6. スクリプト
- `scripts/` 配下にデータ整備用スクリプトを配置
  - 例: `cleanup_customers.js`, `normalize_overpayments.js` など
- 実行例
  ```bash
  cd server
  node scripts/normalize_overpayments.js
  ```
- 大規模更新時は DB バックアップ取得後にスクリプトを実行すること

## 7. 開発・テスト
- 依存インストール: `npm install`
- 開発起動: `npm run dev`
- 単体テスト（Jest）: `npm test`
- DB 初期化: `npm run init-db`（既存 DB は上書きされるため注意）

## 8. 運用メモ
- 7 桁 custom_id を表示用 ID とし、API では内部 ID（数値）を併用
- スキーマ変更は `migrate_*.js` スクリプトを通じて実施
- 配達パターン終了日の短縮・延長には確定済み月のチェックが入る
- 本番反映前に `tests/` 配下の回帰テストを実行し、配達パターン周りの仕様逸脱がないか確認する

---

不明点や追加要件が出た場合は、`requirements.md` と合わせて更新し、運用担当者と合意を取ってください。
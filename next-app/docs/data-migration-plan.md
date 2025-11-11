# SQLite → Supabase データ移行計画

## 1. 概要

既存の `server/milk_delivery.db`（SQLite）を Supabase/Postgres に移行するための手順メモです。  
Supabase スキーマは `supabase/schema.sql` を事前に適用しておくことを前提とします。

---

## 2. 移行フロー

1. **データ抽出**  
   - Node.js スクリプトで SQLite からテーブル単位にデータを読み取る。  
   - `npm run migrate:export` で `supabase/exports/*.json` を生成。  
   - JSON または CSV に書き出し、後続ステップで整形しやすくする。

2. **データ整形**  
   - Supabase スキーマに合わせ、ID・外部キー・日付フォーマットを調整。  
   - `npm run migrate:transform` で `supabase/prepared/*.json` を生成。  
   - JSON フィールド（`delivery_days`, `daily_quantities` 等）はオブジェクトに再構築。

3. **データ投入**  
   - Supabase SDK（サービスロール）を利用し、バッチ挿入を実行。  
   - `npm run migrate:import` で `prepared` データを Supabase に投入。  
   - 大量投入が必要な場合は `COPY` コマンドを検討。

4. **整合性チェック**  
   - テーブルごとの件数、主キー重複、サンプルデータの spot check。  
   - `npm run migrate:verify` で Supabase と `prepared` の件数差分を確認。  
   - 集金・請求関連は月次合計が一致するか検証スクリプトを作成。

---

## 3. 対象テーブルと移行順序（暫定）

1. マスター系：`manufacturers`, `products`, `delivery_courses`, `delivery_staff`, `staff_courses`, `company_info`, `institution_info`
2. 顧客系：`customers`, `customer_settings`
3. 配達関連：`delivery_patterns`, `temporary_changes`, `operation_logs`
4. 請求・入金：`ar_invoices`, `ar_payments`, `ar_ledger`

※ 依存関係（外部キー）を考慮して投入順序を決める。ID が自動採番となるため、元 ID を保持する場合は一時マッピングテーブルを準備。

---

## 4. スクリプト構成案

```
next-app/supabase/scripts/
├── export-sqlite.ts       # SQLite → JSON/CSV 抽出（npm run migrate:export）
├── transform-data.ts      # JSON を Supabase 用に整形（npm run migrate:transform）
├── import-supabase.ts     # Supabase SDK でデータ投入
└── verify-migration.ts    # 件数・サマリーを検証
```

- `export-sqlite.ts`: SQLite `Database` モジュールを使用し、各テーブルを JSON に出力。  
- `transform-data.ts`: JSON を読み込み、日付フォーマット・ID マッピング・数値型チェック。  
- `import-supabase.ts`: サービスロールキーを使用し、`insert` をバッチで実行。  
- `verify-migration.ts`: Supabase に問い合わせて件数や金額を比較。

---

## 5. 注意点

- **ID マッピング**: Supabase 側は IDENTITY（自動採番）のため、旧 ID を保持したい場合は `legacy_id` 列を一時的に持たせるか、INSERT 時に `id` を指定できるよう `identity_insert` (`setval`) を利用する。  
- **日付・タイムゾーン**: SQLite は TEXT 型で保存されている場合があり、UTC 変換が必要。  
- **トランザクション**: Supabase JS からの大量 insert は `upsert` を使わず、バッチ単位に分割する。失敗時のリトライ戦略を検討。  
- **制約**: 外部キー制約違反が起きやすいため、投入順序・Null 許容を再確認。

---

## 6. 次ステップ

- `export-sqlite.ts` の雛形を作成し、マスター系テーブルからエクスポートを試行。  
- Supabase 側でテスト用の空プロジェクトを作成し、`schema.sql` を適用。  
- マイグレーションを自動化するために npm スクリプト（例: `npm run migrate:data`）を追加予定。

- Supabase RPC 作成後、Route Handler は RPC 呼び出し＋結果整形の薄い層にする（例: `rpc_update_customer_ledger`）。  


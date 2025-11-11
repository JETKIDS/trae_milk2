# データ移行ステータス

## 実行済み

### ✅ ステップ 1: データエクスポート
- SQLite データベースから全テーブルのデータを JSON 形式でエクスポート完了
- 出力先: `supabase/exports/*.json`
- エクスポートされたテーブル:
  - manufacturers: 5 rows
  - products: 13 rows
  - delivery_courses: 6 rows
  - delivery_staff: 3 rows
  - staff_courses: 3 rows
  - company_info: 1 row
  - institution_info: 2 rows
  - customers: 62 rows
  - customer_settings: 23 rows
  - delivery_patterns: 177 rows
  - temporary_changes: 117 rows
  - operation_logs: 7 rows
  - ar_invoices: 1,263 rows
  - ar_payments: 801 rows
  - ar_ledger: 0 rows

### ✅ ステップ 2: データ変換
- エクスポートされた JSON を Supabase 用の形式に変換完了
- 出力先: `supabase/prepared/*.json`
- 変換内容:
  - JSON 文字列のパース（`delivery_days`, `daily_quantities`）
  - ブール値の変換（`is_active`, `rounding_enabled`）
  - 数値型の正規化

## 次のステップ

### ⚠️ ステップ 3: Supabase へのインポート（要対応）

**必要な準備:**
1. `.env.local` ファイルを作成（`next-app/.env.local`）
   ```bash
   NEXT_PUBLIC_SUPABASE_URL="https://dvmanjcavamgljdtloby.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2bWFuamNhdmFtZ2xqZHRsb2J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NjExNjcsImV4cCI6MjA3ODMzNzE2N30.etfO2-Dg7e131y08YlJ27G5SXDoyI81lCAh3INlTo9M"
   SUPABASE_SERVICE_ROLE_KEY="<ここに Service Role Key を設定>"
   ```

2. **Service Role Key の取得方法:**
   - Supabase Dashboard にログイン
   - プロジェクト設定 → API → Service Role Key をコピー
   - 上記の `.env.local` に貼り付け

3. **Supabase スキーマの適用:**
   - Supabase Dashboard の SQL Editor を開く
   - `next-app/supabase/schema.sql` の内容をコピーして実行
   - または、Supabase CLI を使用:
     ```bash
     cd next-app/supabase
     supabase db execute --file schema.sql
     ```

4. **インポート実行:**
   ```bash
   cd next-app
   npm run migrate:import
   ```

### ステップ 4: 検証
```bash
cd next-app
npm run migrate:verify          # 簡易検証（件数比較）
npm run migrate:verify:detailed  # 詳細検証（データ内容比較）
```

### ステップ 5: シーケンスリセット（必要に応じて）
```bash
cd next-app
npm run migrate:reset-sequences
# 出力された SQL を Supabase SQL Editor で実行
```

## 注意事項

- 本番環境への移行前に、必ずステージング環境でテストしてください
- インポート前に Supabase のバックアップを取得することを推奨します
- 大量データのインポートには時間がかかる場合があります（約 2,500 レコード）

## トラブルシューティング

詳細は `next-app/supabase/MIGRATION_GUIDE.md` を参照してください。


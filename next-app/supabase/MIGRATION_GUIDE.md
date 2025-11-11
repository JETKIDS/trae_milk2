# SQLite → Supabase データ移行ガイド

## 概要

このガイドでは、既存の SQLite データベース（`server/milk_delivery.db`）から Supabase（PostgreSQL）へのデータ移行手順を説明します。

## 前提条件

- Node.js 18+ がインストールされていること
- `next-app` ディレクトリで作業すること
- Supabase プロジェクトが作成済みで、`schema.sql` が適用済みであること
- 環境変数（`.env.local`）が正しく設定されていること

### 必要な環境変数

`.env.local` に以下を設定してください：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 移行手順

### ステップ 1: スキーマの適用

Supabase Dashboard の SQL Editor で `supabase/schema.sql` を実行するか、Supabase CLI を使用します：

```bash
# Supabase CLI を使用する場合（事前に supabase login が必要）
cd next-app/supabase
supabase db execute --file schema.sql
```

**注意**: 既存のテーブルがある場合は、`DROP TABLE IF EXISTS` を実行するか、手動で削除してからスキーマを適用してください。

### ステップ 2: SQLite データのエクスポート

```bash
cd next-app
npm run migrate:export
```

このコマンドは `server/milk_delivery.db` から全テーブルのデータを JSON 形式で `supabase/exports/` に出力します。

**出力先**: `supabase/exports/*.json`

### ステップ 3: データの変換

```bash
npm run migrate:transform
```

このコマンドは `supabase/exports/` の JSON を Supabase 用の形式に変換し、`supabase/prepared/` に出力します。

**変換内容**:
- JSON 文字列のパース（`delivery_days`, `daily_quantities`）
- ブール値の変換（`is_active`, `rounding_enabled`）
- 数値型の正規化

**出力先**: `supabase/prepared/*.json`

### ステップ 4: Supabase へのインポート

```bash
npm run migrate:import
```

このコマンドは `supabase/prepared/` の JSON を Supabase に一括インポートします。

**注意事項**:
- 外部キー制約があるため、テーブルは依存関係順にインポートされます
- バッチサイズは 500 レコードです（大量データでも効率的に処理）
- エラーが発生した場合は、該当テーブルのエラーメッセージを確認してください

### ステップ 5: シーケンスのリセット（必要に応じて）

ID を明示的に挿入した場合、PostgreSQL のシーケンスが正しく更新されない可能性があります。以下のスクリプトでリセットできます：

```bash
npm run migrate:reset-sequences
```

または、Supabase SQL Editor で以下を実行：

```sql
-- 各テーブルのシーケンスをリセット
SELECT setval(pg_get_serial_sequence('delivery_courses', 'id'), COALESCE((SELECT MAX(id) FROM delivery_courses), 1), true);
SELECT setval(pg_get_serial_sequence('delivery_staff', 'id'), COALESCE((SELECT MAX(id) FROM delivery_staff), 1), true);
SELECT setval(pg_get_serial_sequence('manufacturers', 'id'), COALESCE((SELECT MAX(id) FROM manufacturers), 1), true);
SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE((SELECT MAX(id) FROM products), 1), true);
SELECT setval(pg_get_serial_sequence('customers', 'id'), COALESCE((SELECT MAX(id) FROM customers), 1), true);
SELECT setval(pg_get_serial_sequence('delivery_patterns', 'id'), COALESCE((SELECT MAX(id) FROM delivery_patterns), 1), true);
SELECT setval(pg_get_serial_sequence('temporary_changes', 'id'), COALESCE((SELECT MAX(id) FROM temporary_changes), 1), true);
SELECT setval(pg_get_serial_sequence('ar_invoices', 'id'), COALESCE((SELECT MAX(id) FROM ar_invoices), 1), true);
SELECT setval(pg_get_serial_sequence('ar_payments', 'id'), COALESCE((SELECT MAX(id) FROM ar_payments), 1), true);
SELECT setval(pg_get_serial_sequence('ar_ledger', 'id'), COALESCE((SELECT MAX(id) FROM ar_ledger), 1), true);
SELECT setval(pg_get_serial_sequence('operation_logs', 'id'), COALESCE((SELECT MAX(id) FROM operation_logs), 1), true);
```

### ステップ 6: 移行の検証

```bash
npm run migrate:verify
```

このコマンドは、変換済みデータ（`prepared/`）と Supabase のレコード数を比較し、差分を表示します。

**検証内容**:
- 各テーブルのレコード数比較
- 不一致がある場合は警告を表示

## トラブルシューティング

### エラー: "NEXT_PUBLIC_SUPABASE_URL が設定されていません"

`.env.local` に環境変数が設定されているか確認してください。`import-supabase.ts` と `verify-migration.ts` は `dotenv/config` を使用しているため、`.env.local` が自動的に読み込まれます。

### エラー: "外部キー制約違反"

依存関係順にインポートされているか確認してください。`import-supabase.ts` の `TABLE_ORDER` を確認し、親テーブルが先にインポートされていることを確認してください。

### エラー: "重複キー違反"

既存のデータが Supabase に存在する可能性があります。以下のいずれかを実行してください：

1. Supabase のテーブルをクリアしてから再インポート
2. `import-supabase.ts` を修正して `UPSERT` を使用（推奨しない）

### シーケンスエラー

新しいレコードを追加する際に ID の重複が発生する場合は、ステップ 5 のシーケンスリセットを実行してください。

## ロールバック手順

移行に失敗した場合、以下の手順でロールバックできます：

### 方法 1: Supabase テーブルのクリア

Supabase SQL Editor で以下を実行（**注意: 全データが削除されます**）：

```sql
-- 外部キー制約を無視して全テーブルを削除（依存関係順に注意）
TRUNCATE TABLE ar_ledger CASCADE;
TRUNCATE TABLE ar_payments CASCADE;
TRUNCATE TABLE ar_invoices CASCADE;
TRUNCATE TABLE temporary_changes CASCADE;
TRUNCATE TABLE delivery_patterns CASCADE;
TRUNCATE TABLE customer_settings CASCADE;
TRUNCATE TABLE customers CASCADE;
TRUNCATE TABLE operation_logs CASCADE;
TRUNCATE TABLE products CASCADE;
TRUNCATE TABLE delivery_staff CASCADE;
TRUNCATE TABLE staff_courses CASCADE;
TRUNCATE TABLE delivery_courses CASCADE;
TRUNCATE TABLE manufacturers CASCADE;
TRUNCATE TABLE company_info CASCADE;
TRUNCATE TABLE institution_info CASCADE;
```

### 方法 2: スキーマの再適用

`schema.sql` を再実行してテーブルを再作成します（既存データは削除されます）。

## 検証チェックリスト

移行完了後、以下を確認してください：

- [ ] 全テーブルのレコード数が一致している
- [ ] 顧客情報が正しく表示される（`/customers/[id]`）
- [ ] 配達パターンが正しく表示される
- [ ] 請求・入金データが正しく表示される
- [ ] カレンダー生成が正しく動作する
- [ ] 臨時変更が正しく表示される
- [ ] マスターデータ（コース・スタッフ・メーカー）が正しく表示される

## 本番環境への適用

本番環境への移行は、以下の手順を推奨します：

1. **ステージング環境で検証**: まずステージング Supabase プロジェクトで移行を実行し、全機能をテスト
2. **バックアップ**: 本番 SQLite データベースのバックアップを取得
3. **メンテナンスモード**: 本番アプリケーションをメンテナンスモードに設定
4. **移行実行**: 本番 Supabase プロジェクトで移行を実行
5. **検証**: 本番環境で全機能をテスト
6. **切り替え**: Next.js アプリケーションを本番環境にデプロイ

## 関連ファイル

- `supabase/schema.sql` - Supabase スキーマ定義
- `supabase/scripts/export-sqlite.ts` - SQLite エクスポートスクリプト
- `supabase/scripts/transform-data.ts` - データ変換スクリプト
- `supabase/scripts/import-supabase.ts` - Supabase インポートスクリプト
- `supabase/scripts/verify-migration.ts` - 検証スクリプト
- `supabase/scripts/reset-sequences.ts` - シーケンスリセットスクリプト（新規作成予定）


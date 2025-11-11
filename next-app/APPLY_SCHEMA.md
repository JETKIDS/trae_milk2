# Supabase スキーマ適用手順

## エラー内容
インポート時に `Could not find the table 'public.manufacturers' in the schema cache` というエラーが発生しています。
これは、Supabase にスキーマが適用されていないことを示しています。

## 解決方法

### 方法 1: Supabase Dashboard の SQL Editor を使用（推奨）

1. Supabase Dashboard にログイン: https://supabase.com/dashboard/project/dvmanjcavamgljdtloby
2. 左メニューから「SQL Editor」を選択
3. 「New query」をクリック
4. `next-app/supabase/schema.sql` の内容をコピーして貼り付け
5. 「Run」ボタンをクリックして実行

### 方法 2: Supabase CLI を使用

```bash
cd next-app/supabase
supabase db execute --file schema.sql
```

## スキーマ適用後の確認

スキーマが正しく適用されたか確認するには、Supabase Dashboard の「Table Editor」で以下のテーブルが表示されることを確認してください：

- manufacturers
- products
- delivery_courses
- delivery_staff
- customers
- delivery_patterns
- temporary_changes
- ar_invoices
- ar_payments
- ar_ledger
- など

## スキーマ適用後

スキーマを適用したら、再度インポートを実行してください：

```bash
cd next-app
npm run migrate:import
```


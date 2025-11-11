# Supabase スキーマ適用詳細ガイド

## 概要

`schema.sql` を Supabase プロジェクトに適用して、必要なテーブル、インデックス、RPC 関数を作成します。

## 前提条件

- Supabase プロジェクトが作成済みであること
- Supabase Dashboard にアクセスできること
- プロジェクト URL: https://supabase.com/dashboard/project/dvmanjcavamgljdtloby

---

## 方法 1: Supabase Dashboard の SQL Editor を使用（推奨・最も簡単）

### ステップ 1: SQL Editor を開く

1. ブラウザで Supabase Dashboard にアクセス
   - URL: https://supabase.com/dashboard/project/dvmanjcavamgljdtloby
2. 左サイドバーのメニューから **「SQL Editor」** をクリック
   - アイコンは通常、データベースアイコン（□）または SQL アイコン（</>）です

### ステップ 2: 新しいクエリを作成

1. SQL Editor 画面で **「New query」** ボタンをクリック
   - または、既存のクエリタブがある場合は、右上の **「+ New query」** をクリック

### ステップ 3: schema.sql の内容をコピー

1. ローカルの `next-app/supabase/schema.sql` ファイルを開く
2. ファイル全体を選択（Ctrl+A）してコピー（Ctrl+C）
   - ファイルは約 553 行あります

### ステップ 4: SQL Editor に貼り付け

1. Supabase Dashboard の SQL Editor のクエリ入力欄に貼り付け（Ctrl+V）
2. 内容が正しく貼り付けられたか確認
   - 最初の行は `-- Supabase Schema for 牛乳配達顧客管理システム` で始まるはずです

### ステップ 5: クエリを実行

1. SQL Editor の右下にある **「Run」** ボタンをクリック
   - または、キーボードショートカット `Ctrl+Enter`（Windows）を使用
2. 実行が完了するまで待機（数秒〜数十秒かかる場合があります）

### ステップ 6: 実行結果を確認

1. 実行結果が画面下部に表示されます
2. **成功の場合:**
   - 「Success. No rows returned」または類似のメッセージが表示されます
   - エラーメッセージが表示されないことを確認
3. **エラーの場合:**
   - エラーメッセージを確認
   - よくあるエラー:
     - `relation "xxx" already exists` → テーブルが既に存在（`IF NOT EXISTS` により通常は問題なし）
     - `syntax error` → SQL の構文エラー（貼り付けが不完全な可能性）

### ステップ 7: テーブルの確認

1. 左サイドバーのメニューから **「Table Editor」** をクリック
2. 以下のテーブルが表示されることを確認:
   - `delivery_courses`
   - `delivery_staff`
   - `manufacturers`
   - `products`
   - `customers`
   - `delivery_patterns`
   - `temporary_changes`
   - `ar_invoices`
   - `ar_payments`
   - `ar_ledger`
   - など

---

## 方法 2: Supabase CLI を使用（開発者向け）

### 前提条件

- Node.js がインストールされていること
- Supabase CLI がインストールされていること

### Supabase CLI のインストール

```bash
# npm を使用する場合
npm install -g supabase

# または、Homebrew（macOS）を使用する場合
brew install supabase/tap/supabase
```

### ステップ 1: Supabase にログイン

```bash
supabase login
```

ブラウザが開き、Supabase アカウントでログインします。

### ステップ 2: プロジェクトにリンク

```bash
cd next-app/supabase
supabase link --project-ref dvmanjcavamgljdtloby
```

### ステップ 3: スキーマを適用

```bash
supabase db execute --file schema.sql
```

または、直接 SQL を実行:

```bash
supabase db execute < schema.sql
```

### ステップ 4: 確認

```bash
supabase db list
```

テーブル一覧が表示されます。

---

## 方法 3: psql を使用（上級者向け）

### 前提条件

- PostgreSQL クライアント（psql）がインストールされていること
- Supabase プロジェクトのデータベース接続情報を取得していること

### 接続情報の取得

1. Supabase Dashboard → Settings → Database
2. 「Connection string」セクションの「URI」をコピー
   - 形式: `postgresql://postgres:[PASSWORD]@db.dvmanjcavamgljdtloby.supabase.co:5432/postgres`

### スキーマの適用

```bash
psql "postgresql://postgres:[PASSWORD]@db.dvmanjcavamgljdtloby.supabase.co:5432/postgres" -f next-app/supabase/schema.sql
```

---

## トラブルシューティング

### エラー: "relation already exists"

**原因:** テーブルが既に存在している

**解決方法:**
- `schema.sql` は `CREATE TABLE IF NOT EXISTS` を使用しているため、通常は問題ありません
- 既存のテーブルを削除したい場合は、Supabase Dashboard の Table Editor から手動で削除

### エラー: "permission denied"

**原因:** 権限が不足している

**解決方法:**
- Supabase Dashboard の SQL Editor を使用する（Service Role 権限で実行される）
- または、プロジェクトのオーナー権限を確認

### エラー: "syntax error near line X"

**原因:** SQL の構文エラー

**解決方法:**
1. `schema.sql` の該当行を確認
2. コピー＆ペーストが完全に行われたか確認
3. 特殊文字（日本語コメントなど）が正しくエンコードされているか確認

### エラー: "could not find function"

**原因:** RPC 関数の作成に失敗

**解決方法:**
1. SQL Editor でエラーが発生した行を特定
2. 該当する RPC 関数の定義を確認
3. 必要に応じて、関数を個別に実行

---

## スキーマ適用後の確認事項

### 1. テーブルの存在確認

Supabase Dashboard → Table Editor で以下のテーブルが存在することを確認:

- ✅ `delivery_courses`
- ✅ `delivery_staff`
- ✅ `manufacturers`
- ✅ `products`
- ✅ `customers`
- ✅ `customer_settings`
- ✅ `delivery_patterns`
- ✅ `temporary_changes`
- ✅ `ar_invoices`
- ✅ `ar_payments`
- ✅ `ar_ledger`
- ✅ `operation_logs`
- ✅ `company_info`
- ✅ `institution_info`
- ✅ `profiles`
- ✅ `undo_stack`
- ✅ `master_undo_stack`

### 2. RPC 関数の確認

Supabase Dashboard → Database → Functions で以下の関数が存在することを確認:

- ✅ `rpc_update_customer_ledger`
- ✅ `rpc_confirm_invoice`
- ✅ `rpc_unconfirm_invoice`
- ✅ `rpc_push_undo`
- ✅ `rpc_pop_undo`
- ✅ `rpc_push_master_undo`
- ✅ `rpc_pop_master_undo`

### 3. インデックスの確認

Supabase Dashboard → Database → Indexes で主要なインデックスが作成されていることを確認

---

## 次のステップ

スキーマが正しく適用されたら、データ移行を実行します:

```bash
cd next-app
npm run migrate:import
```

---

## 参考リンク

- [Supabase SQL Editor ドキュメント](https://supabase.com/docs/guides/database/overview)
- [Supabase CLI ドキュメント](https://supabase.com/docs/guides/cli)
- [PostgreSQL CREATE TABLE ドキュメント](https://www.postgresql.org/docs/current/sql-createtable.html)


# Supabase スキーマ運用ガイド

## 1. 概要

`schema.sql` は Supabase/Postgres 上で既存 SQLite スキーマを再現するための DDL です。  
顧客・配達・請求・入金・運用ログなど、`requirements.md` とバックエンド README に記載されたテーブルを網羅しています。

---

## 2. 適用手順

1. `schema.sql` を Supabase SQL Editor で実行するか、Supabase CLI から適用します。
   ```bash
   # 例: Supabase CLI（事前に supabase login 済み）
   cd next-app/supabase
   supabase db execute --file schema.sql
   ```
2. 既存の SQLite データを移行する際は、別途データ移行スクリプト（後続タスク）を実行してください。
3. `billing_method` および `temporary_change_type` は ENUM として定義済みです。将来的に値を追加する場合は `ALTER TYPE ... ADD VALUE` を利用します。

---

## 3. 主なテーブルと用途

| テーブル | 用途 | 備考 |
|----------|------|------|
| `delivery_courses` | 配達コースマスター | `custom_id` で 3 桁 ID を管理 |
| `products` | 商品マスター | 税区分 `tax_category` を追加済み |
| `customers` | 顧客情報 | `custom_id`（7 桁）、`delivery_order` をサポート |
| `delivery_patterns` | 定期配達パターン | `delivery_days` / `daily_quantities` は `jsonb` |
| `temporary_changes` | 臨時変更 | `temporary_change_type` ENUM（skip/add/modify） |
| `customer_settings` | 顧客の請求設定 | `billing_method` ENUM、銀行情報等を保持 |
| `ar_invoices` | 月次請求 | `status`（draft/confirmed/canceled）を保持 |
| `ar_payments` | 入金履歴 | `billing_method` ENUMで集金/引落を記録 |
| `ar_ledger` | 売掛残高サマリー | 開始残高/請求額/入金額/繰越を保持 |
| `operation_logs` | バッチ操作ログ | パラメータ・処理結果を JSON で保存 |
| `company_info` / `institution_info` | 会社・収納機関設定 | 1 レコード想定 |

---

## 4. 今後の拡張

- Supabase Functions / RPC により請求サマリーや一括入金補助を実装予定です。
- データ移行スクリプト、サンプルデータ投入スクリプトを `next-app/supabase/scripts/` に追加する予定です。
- 監査用テーブルが必要になった場合は `schema.sql` の末尾に追記し、ドキュメントを更新してください。


# Next.js / Supabase 移行設計メモ

## 1. 目的

現行の React（Vite）＋ Express（SQLite）構成を、Next.js（App Router）＋ Supabase に全面移行し、Vercel へデプロイ可能な形へ統合する。`requirements.md`／`client/src/README.md`／`server/README.md` に記載された機能を 100% 再現しつつ、集金・請求まわりの正確性を最優先とする。

---

## 2. アーキテクチャ概要

| レイヤー | 現行 | 新構成 |
|----------|------|--------|
| UI / ルーティング | React + react-router | Next.js App Router（`src/app`） |
| サーバーサイド | Express ルート + サービス層 | Next.js Route Handlers / Server Actions（`src/app/**/route.ts` 等） |
| データベース | SQLite (`server/milk_delivery.db`) | Supabase Postgres（Auth・ストレージ未使用予定） |
| 認証 | なし（シングルユーザー） | Supabase Auth は将来的に拡張。現段階では匿名アクセス |
| デプロイ | Node サーバー + 静的ホスティング | Vercel（Preview / Production） |

Supabase の操作は共通クライアント `@/lib/supabaseClient` と、サーバー専用のラッパ（Service Role キー利用）で実装する。

---

## 3. Supabase スキーマ移行ポリシー

1. **テーブル構成**  
   SQLite のテーブルを基準に以下を作成（主キーは `uuid` か `bigint` を検討）。  
   - `customers`：顧客基本情報（`custom_id` は unique index、7 桁ゼロ埋め）  
   - `delivery_patterns`：商品・曜日別の定期パターン。JSON 列（`delivery_days`, `daily_quantities`）は `jsonb` で保持  
   - `temporary_changes`：臨時変更。`change_type` は enum（`skip/add/modify`）  
   - `ar_invoices`：請求情報。繰越計算に必要な `carryover_amount`, `confirmed_at` を保持  
   - `ar_payments`：入金。`method`（`cash`/`withdrawal`）を enum 化  
   - その他マスター（商品・メーカー・コース等）を Postgres スキーマで再現

2. **ビュー / RPC**  
   請求サマリーや一括入金向け集計は、Supabase RPC または Materialized View で補助。  
   - 例: `rpc_get_customer_ar_summary(customer_id, target_month)`  
   - 例: `view_course_monthly_billing`

3. **マイグレーション**  
   - `server/milk_delivery.db` からデータを抽出し、Supabase 用に整形する Node スクリプトを `scripts/` に作成  
   - データ投入時、ID の整合性（`custom_id`）と日付型（UTC）の変換に注意  
   - Supabase CLI で本番環境へ一括投入する手順も整備

---

## 4. フロントエンド移行ステップ

1. **共通レイアウト / 広告プレースホルダ**
   - `src/app/layout.tsx` にグローバルレイアウトを構築  
   - サイドバー／ヘッダー構成を Next.js の Layout 機能で再現  
   - 広告枠は `AdSlot` コンポーネント（ダミー）を用意し、全ページに埋め込む

2. **ページ移行順**
   1. `CustomerDetail` 画面（最重要） **→ Next.js 版 初期実装完了（カレンダー表示／請求確定／入金登録対応）**  
      - カレンダー描画は React Server Components + Client Components のハイブリッド  
      - Undo 管理は Client Component 側で Zustand / Context を検討  
      - 未移植: パターン編集ダイアログ、臨時変更登録 UI、Undo UI など高度操作  
   2. `InvoicePreview`（PDF/印刷対応）  
      - Next.js の Route Handler で HTML→PDF 生成（SSR）を検討  
      - **Next.js 版プレビュー画面を移植中**（2025-11-11 時点: サーバーデータ取得〜閲覧 UI を実装、PDF 出力は未対応）  
   3. `BulkCollection`（一括入金）  
      - Supabase RPC と組み合わせてデータ取得  
   4. その他マスター管理ページ

3. **API 呼び出し置換**
   - `axios` ベースの `apiClient` を廃止し、Supabase client or Route Handler に置換  
   - パラメータ検証は Zod を導入し、`app/api/**/route.ts` で実施  
   - Undo / 競合制御のため、重要操作はトランザクションを利用

---

## 5. サーバーサイドロジック再構築

| 現行サービス | 新構成 | 備考 |
|--------------|--------|------|
| `customerService` | `app/api/customers/[id]/route.ts` 等 | RSC に必要なデータを `select` で取得 |
| `customerLedgerService` | Supabase RPC + Server Action | 月次請求・繰越ロジックを Postgres 関数に移植 |
| `customerPaymentService` | `app/api/payments/**` | 入金登録時にトランザクション |
| `customerCalendarService` | Server Action | カレンダー用データ整形をサーバーで実行 |

Route Handler は Edge ではなく Node ランタイムで稼働させ、Supabase との接続を安定させる。

---

## 6. テスト戦略

1. **ユニットテスト**  
   - Supabase RPC / Service 層を Vitest or Jest で検証  
   - 集金・繰越の算出ロジックを重視

2. **E2E テスト**  
   - Playwright を導入し、顧客詳細→請求確定→入金登録までのシナリオを自動化  
   - 広告枠（ダミー）の表示確認も含める

3. **データ移行検証**  
   - 本番データのサンプルを Supabase ステージングへ流し、差分チェック（Row 数・金額）をスクリプト化

---

## 7. ロードマップ（暫定）

1. Next.js 基盤整備（完了）  
2. Supabase スキーマ定義 & マイグレーションスクリプト作成  
3. 顧客詳細画面 + 関連 API 移植（進行中：閲覧・請求・入金操作は Next.js 版が稼働。編集系 UI を追加予定）  
4. 月次請求・入金・一括入金フロー移植  
5. その他マスター機能移行  
6. テスト整備・E2E  
7. Vercel デプロイ設定 & 最終レビュー  
8. 広告枠の本実装（後続フェーズ）

---

## 8. 残課題

- Supabase のテーブル設計詳細（Primary Key, Index, Enum）の最終確定  
- Undo ロジックの実装方式（マスターは Server Action 対応済み。顧客カレンダー系の UI/履歴整備が未着手）  
- Route Handler / Server Action のエラーハンドリング共通化  
- Vercel 環境での Supabase サービスロールキー取扱方針  
- 顧客詳細 UI の編集系機能（パターン編集、臨時変更登録、Undo UI など）移植  
- `InvoicePreview` / `BulkCollection` など残りの主要画面移植  
- 広告配信ネットワーク決定後のタグ挿入方法検討

上記を順次対応しながら、既存機能の完全移植を進める。


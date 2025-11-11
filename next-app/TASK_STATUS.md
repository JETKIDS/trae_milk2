# タスク進捗状況レポート

## 完了済みタスク ✅

### 1. 顧客ダッシュボード／詳細ページを Next.js App Router へ移植
**ステータス**: ✅ **完了**

**実装内容**:
- `next-app/src/app/customers/[customerId]/page.tsx` - サーバーコンポーネント
- `next-app/src/app/customers/[customerId]/CustomerDetailClient.tsx` - クライアントコンポーネント
- `next-app/src/app/customers/[customerId]/loadCustomerDetail.ts` - データローダー
- カレンダー表示、請求ステータス、入金登録、ARサマリー表示が実装済み

**実装済み機能**:
- ✅ 顧客情報の表示
- ✅ 月次カレンダーの表示
- ✅ 請求確定/取消
- ✅ 入金登録
- ✅ 臨時変更一覧の表示
- ✅ 臨時変更登録フォーム

### 2. Supabase 認証導入と /masters 含む管理画面ガード
**ステータス**: ✅ **完了**

**実装内容**:
- `next-app/middleware.ts` - ルート保護
- `next-app/src/lib/auth/server.ts` - サーバーサイド認証ユーティリティ
- `next-app/src/lib/auth/actions.ts` - 認証アクション
- `next-app/src/app/login/page.tsx` - ログインページ
- `next-app/src/app/_components/HeaderAuthStatus.tsx` - 認証ステータス表示

**実装済み機能**:
- ✅ Supabase Auth によるメール OTP 認証
- ✅ `/masters` と `/api/masters` のミドルウェア保護
- ✅ Server Actions での `ensureAdmin()` チェック
- ✅ `profiles` テーブルによるロール管理

### 3. SQLite→Supabase 本番データ移行
**ステータス**: ✅ **完了**

**実装内容**:
- `next-app/supabase/scripts/export-sqlite.ts` - SQLite エクスポート
- `next-app/supabase/scripts/transform-data.ts` - データ変換
- `next-app/supabase/scripts/import-supabase.ts` - Supabase インポート
- `next-app/supabase/scripts/verify-migration.ts` - 検証スクリプト
- `next-app/supabase/scripts/reset-sequences.ts` - シーケンスリセット

**移行結果**:
- ✅ 約 2,500 レコード中、2,477 レコードを正常に移行
- ✅ 23 レコードは無効な外部キー参照のためスキップ（データ整合性のため）

### 7. SQLite→Supabase データ移行の手順確立と検証
**ステータス**: ✅ **完了**

**実装内容**:
- `next-app/supabase/MIGRATION_GUIDE.md` - 詳細な移行手順書
- `next-app/supabase/APPLY_SCHEMA_DETAILED.md` - スキーマ適用詳細ガイド
- `next-app/MIGRATION_COMPLETE.md` - 移行完了レポート
- 検証スクリプト（簡易・詳細）の実装

---

## 一部未完了タスク ⚠️

### 4. 顧客詳細画面の編集系機能（配達パターン/臨時変更/Undo UI）
**ステータス**: ⚠️ **一部完了**

**完了済み**:
- ✅ 臨時変更登録フォーム（`TemporaryChangeForm` コンポーネント）
- ✅ 臨時変更一覧の表示
- ✅ 臨時変更の API 実装（`/api/temporary-changes`）

**未実装**:
- ❌ 配達パターン編集ダイアログ
- ❌ 臨時変更の更新・削除 UI
- ❌ Undo UI（操作履歴の表示と取り消し）
- ❌ 配達パターンの Undo 機能

**必要な作業**:
1. 配達パターン編集ダイアログの実装
2. 臨時変更の更新・削除 UI の追加
3. Undo スタックの表示と操作 UI
4. `/api/customers/[id]/undo` の UI 統合

### 5. 請求書プレビュー (InvoicePreview) ページを Next.js に移植
**ステータス**: ⚠️ **一部完了**

**完了済み**:
- ✅ プレビュー画面の実装（`next-app/src/app/invoices/[customerId]/page.tsx`）
- ✅ データ取得と表示（`loadInvoicePreview.ts`）
- ✅ 請求書情報の表示（日別配達一覧、合計金額など）

**未実装**:
- ❌ PDF 出力機能
- ❌ 印刷機能の最適化

**必要な作業**:
1. PDF 生成ライブラリの導入（例: `@react-pdf/renderer` または `puppeteer`）
2. PDF ダウンロード機能の実装
3. 印刷用スタイルの最適化

---

## 未実装タスク ❌

### 6. BulkCollection（一括入金）ページを Next.js に移植
**ステータス**: ❌ **未実装**

**現状**:
- 既存実装: `client/src/pages/BulkCollection.tsx`
- Next.js 版: 未作成

**必要な作業**:
1. `next-app/src/app/bulk-collection/page.tsx` の作成
2. コース別の請求額・入金額集計 API の実装
3. 一括入金登録 API の実装
4. UI の実装（コース選択、金額表示、一括登録フォーム）

**参考実装**:
- 既存 API: `/api/customers/by-course/[courseId]/invoices-amounts`
- 既存 API: `/api/customers/by-course/[courseId]/payments-sum`
- 既存 API: `/api/customers/payments/batch`

---

## 優先度別タスク一覧

### 高優先度（機能の完全性に影響）

1. **BulkCollection（一括入金）ページの実装** ❌
   - 集金業務の核心機能
   - 既存 API の実装状況を確認してから着手

2. **配達パターン編集機能** ⚠️
   - 顧客管理の基本機能
   - ダイアログ UI の実装が必要

3. **臨時変更の更新・削除 UI** ⚠️
   - データ修正のための必須機能

### 中優先度（運用効率に影響）

4. **Undo UI の実装** ⚠️
   - 誤操作の取り消し機能
   - バックエンド API は実装済み（`/api/customers/[id]/undo`）

5. **PDF 出力機能** ⚠️
   - 請求書の印刷・保存機能
   - 必須ではないが、運用上便利

---

## 次のアクション

### 即座に着手すべきタスク

1. **BulkCollection ページの実装**
   - 既存の `BulkCollection.tsx` を参考に Next.js 版を作成
   - 必要な API エンドポイントの実装状況を確認

2. **配達パターン編集ダイアログ**
   - モーダル/ダイアログコンポーネントの実装
   - 配達パターン更新 API の実装（`/api/delivery-patterns/[id]`）

3. **臨時変更の更新・削除 UI**
   - 既存の臨時変更一覧に編集・削除ボタンを追加
   - 更新・削除 API は実装済み（`/api/temporary-changes/[id]`）

### 後続タスク

4. **Undo UI の実装**
   - Undo スタックの表示コンポーネント
   - 取り消しボタンの実装

5. **PDF 出力機能**
   - PDF 生成ライブラリの選定と導入
   - ダウンロード機能の実装

---

## 参考情報

- 既存実装: `client/src/pages/BulkCollection.tsx`
- API 実装状況: `next-app/docs/api-routing-plan.md`
- 移行計画: `next-app/docs/migration-plan.md`



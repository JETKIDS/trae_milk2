# マスター管理向け認証・権限管理計画（2025-11-11）

## 1. 目的

- `/masters` 画面および関連 Server Actions / Route Handlers を、権限を持つ管理者のみ操作可能にする。  
- Supabase 無料プラン前提で構築しつつ、将来の追加管理者や有料プラン移行にも耐えられる運用を目指す。  
- Undo／マスター更新のような破壊的操作にも監査可能性を持たせる。

## 2. 想定ロール

| ロール | 想定利用者 | 主な権限 |
|--------|------------|---------|
| `admin` | 本社担当者 | マスター CRUD、Undo、データ移行系スクリプト実行 |
| `operator` | 事務担当者 | 顧客/請求/入金操作、マスター閲覧のみ |
| `viewer` | 閲覧専用 | ダッシュボード参照 |

※ 初期段階では `admin` のみ発行し、他ロールは将来追加。

## 3. Supabase 側の設計

1. **ユーザー管理**
   - `auth.users` を利用。初期管理者はメールリンクで招待。
   - プロファイル拡張用に `profiles` テーブルを追加（`user_id uuid primary key`, `role text` 等）。

2. **RLS ポリシー草案**
   - `delivery_staff`, `manufacturers`, `company_info`, `institution_info`, `delivery_courses` 等マスター系テーブルに RLS を有効化。
   - ポリシー例:
     ```sql
     create policy "Allow admin read/write"
     on delivery_staff
     for all
     using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'admin'))
     with check (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'admin'));

     create policy "Allow operator read"
     on delivery_staff
     for select
     using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role in ('admin', 'operator')));
     ```
   - `company_info`/`institution_info` は単一レコードなので、`id = 1` に限定した with check を明示。

3. **RPC / Undo 系**
   - `rpc_push_master_undo`, `rpc_pop_master_undo` に対しても RLS ではじくのではなく、`security definer` + 内部で `auth.uid()` を検証。
   - `metadata` に `performed_by`（`auth.uid()`）を付与し、監査ログとして利用。

4. **サービスロール利用**
   - Next.js Server Actions からはサービスロールキーを使用、RLS をバイパス。ただし操作直前にアプリ側でロールチェックを行うことでガード。
   - 将来的に Vercel Edge Functions / Serverless Cron などからも使えるよう統一。

## 4. Next.js 側アーキテクチャ

1. **セッション管理**
   - `@supabase/auth-helpers-nextjs` を導入し、App Router の Server Components / Route Handler で `createServerComponentClient` を使用。
   - レイアウト段階でセッションの有無・ロールを取得し、`/masters` へのアクセスを制御。

2. **ミドルウェア**
   - `middleware.ts` に `/masters(.*)` を対象としたガードを追加。  
     - 未ログイン → `/login` にリダイレクト。  
     - ロールが `admin` 以外 → 403 ページを返却。  
   - **実装済み（2025-11-11）**: `/masters` / `/api/masters` のアクセスを Supabase セッション＋`profiles.role` で検証。

3. **Server Action ガード**
   - `masters/actions.ts` 先頭で `ensureAdmin()` のようなユーティリティを用意し、各 Action の冒頭で呼び出す。  
     - Supabase セッションから `profile.role` を取得。  
     - `admin` でなければ例外を投げて処理を中断。  
   - **実装済み（2025-11-11）**: `ensureAdmin()` を導入し、Undo ログには `performed_by` を格納。

4. **監査ログ**
   - Action 実行時に `metadata` や Supabase テーブル `operation_logs` へ書き込む余地を残す。

## 5. 実装手順（ターゲット: Sprint 3）

1. **Day 1-2**
   - `profiles` テーブル・シードデータ作成、`schema.sql` へ追加。
   - Supabase Dashboard で RLS 有効化（該当テーブルのみ）。
2. **Day 3**
   - Next.js に Supabase Auth Helper を導入し、ログイン UI 雛形 (`/login`) を作成。**→ 完了**
   - `middleware.ts` で `/masters` ガード。**→ 完了**
3. **Day 4**
   - Server Actions へ `ensureAdmin()` を適用。  
   - `rpc_push_master_undo` 呼び出し時に `metadata.performed_by` を付与。
4. **Day 5**
   - E2E テスト（Playwright）でロールごとのアクセス制御を検証。  
   - ドキュメント更新、運用手順書（管理者追加方法、緊急時解除手順）を作成。

## 6. 未決事項 / リスク

- 無料プランでの認証上限（1 万ユーザー/月）は問題ないが、メール送信数制限に注意。  
- RLS 適用後、既存 Server Action がサービスロール経由でしか動かなくなるため必ず `.env` にサービスロールキーを設定。  
- 将来的に権限を Supabase Auth 以外（企業内 IdP）で統合する場合は、OAuth Provider を導入し `role` を JWT Claim から取得する実装に切り替える。  
- 403 ページを国際化するか検討（運用チームに合わせたメッセージが必要）。

## 7. 現在の実装状況（2025-11-11）

- `profiles` テーブルを Supabase スキーマへ追加（role 管理の下地を整備）。  
- `/login` ページを実装し、メール OTP ベースのログインフローを提供。  
- `middleware.ts` による `/masters` / `/api/masters` ガードと、`HeaderAuthStatus` によるログイン状態表示／サインアウトを実装。  
- マスター Server Action は `ensureAdmin()` を通して管理者のみ実行可能になり、Undo メタデータに `performed_by` を付与。  
- 今後は RLS ポリシー適用・`profiles` シード・管理者招待フローを Supabase 側で整備する。


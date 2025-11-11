# Supabase アクセスレイヤー設計メモ

## 1. クライアント構成

| 用途 | ファイル | 説明 |
|------|----------|------|
| ブラウザ／RSC 共有 | `src/lib/supabaseClient.ts` | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` を使用。認証なしで読み取り（または軽微な更新）を行う。 |
| サーバー専用 | `src/lib/supabaseServer.ts` | `SUPABASE_SERVICE_ROLE_KEY` を使用。Route Handler や Server Action から強権操作（トランザクション、ACL 無視の更新）を行う。 |
| 共通型定義 | `src/lib/types/supabase.ts`（予定） | Supabase の自動生成型または Zod スキーマを格納予定。 |

- サービスロールキーはブラウザに露出しないよう、サーバー専用モジュールにのみ依存させる。
- Route Handler 内でのリクエスト処理は `withServiceSupabase`（計画中）を利用して接続を閉じ忘れないようにする。

```typescript
// 擬似コード
export async function withServiceSupabase<T>(fn: (client: SupabaseClient) => Promise<T>) {
  const supabase = createServiceClient();
  try {
    return await fn(supabase);
  } finally {
    // Supabase JS v2 は明示クローズ不要。将来接続プール切り替え時のフックを想定。
  }
}
```

## 2. 環境変数

| 変数名 | 用途 | 設定場所 |
|--------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | プロジェクト URL | `.env.local`（ブラウザ公開可） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon キー | `.env.local`（ブラウザ公開可） |
| `SUPABASE_SERVICE_ROLE_KEY` | サービスロールキー | `.env.local`（サーバーのみ参照） |

- Vercel では `Project Settings > Environment Variables` に同名で登録する。
- サービスロールキーは `Preview` と `Production` で分けられるなら分離推奨。

## 3. API レイヤー方針

1. **Route Handlers (`src/app/api/**/route.ts`)**
   - GET: 基本的に anon クライアントで対応可能なものは `supabase`（anon）を利用。
   - POST/PUT/DELETE: 既存 Express サービスでトランザクションや権限制御が必要な箇所は `supabaseServer` を利用。
   - 入力検証に `zod` を導入予定（`lib/validators/**`）。  

2. **Server Actions**
   - ページ専用のミューテーションは Server Action で提供し、内部でサービスロールクライアントを使用。
   - Action 実行後は `revalidatePath` 等で UI 側キャッシュを更新。

## 4. トランザクション方針

- Supabase JS v2 の `supabase.rpc` と Postgres RPC（SQL Function）を組み合わせ、請求確定や一括入金など複数テーブル操作を一括で実行。
- 重要ロジックの例:
  - `rpc_confirm_invoice(customer_id, year, month, rounding_enabled)`  
  - `rpc_register_payment(customer_id, year, month, amount, method, note)`  
  - `rpc_bulk_collection(course_id, target_year, target_month, payload jsonb)`
- 将来的な Supabase Edge Function 移行も想定し、RPC 名は `rpc_*` に統一する。

## 5. 次のステップ

- `src/lib/supabaseServer.ts` にサービスロールラッパーを実装（本メモに従い対応済み予定）。
- RPC の SQL 定義を `supabase/schema.sql` へ追記。
- Route Handler 雛形（`customers`, `payments`, `invoices`）を用意し、既存 Express サービスの振る舞いを移植。
- Zod ベースのバリデーションユーティリティを準備し、入力値チェックを共通化。


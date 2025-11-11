# API ルーティング計画

本ドキュメントは既存 Express ルートを Next.js Route Handler に移植する際のパス設計を整理したものです。  
移植が完了した段階で実装状況・バリデーション・レスポンス仕様を更新してください。

---

## 1. 顧客関連

| 現行 Express | Next.js Route | 実装状況 |
|--------------|---------------|----------|
| `GET /api/customers` | `GET /api/customers` | 取得のみ実装（50件まで / 今後拡張） |
| `POST /api/customers` | `POST /api/customers` | 未実装（501 プレースホルダ） |
| `GET /api/customers/:id` | `GET /api/customers/[id]` | Supabase から単一取得（暫定） |
| `PUT /api/customers/:id` | `PUT /api/customers/[id]` | 未実装 |
| `PUT /api/customers/:id/settings` | `PUT /api/customers/[id]/settings` | 未実装 |
| `GET /api/customers/:id/settings` | `GET /api/customers/[id]/settings` | 未実装 |
| `GET /api/customers/:id/calendar/:year/:month` | `GET /api/customers/[id]/calendar/[year]/[month]` | GET 実装（パターン + 臨時変更計算） |

## 2. 請求・入金

| 現行 Express | Next.js Route | 実装状況 |
|--------------|---------------|----------|
| `POST /api/customers/:id/invoices/confirm` | `POST /api/customers/[id]/invoices/confirm` | POST 実装（`rpc_confirm_invoice`） |
| `POST /api/customers/:id/invoices/unconfirm` | `POST /api/customers/[id]/invoices/unconfirm` | POST 実装（`rpc_unconfirm_invoice`） |
| `GET /api/customers/:id/invoices/status` | `GET /api/customers/[id]/invoices/status` | GET 実装（Supabase 参照） |
| `GET /api/customers/:id/payments` | `GET /api/customers/[id]/payments` | GET 実装（limit クエリ対応） |
| `POST /api/customers/:id/payments` | `POST /api/customers/[id]/payments` | POST 実装（Supabase 挿入 + `rpc_update_customer_ledger`） |
| `GET /api/customers/payments/batch` | ※フロント未使用 | ― |
| `POST /api/customers/payments/batch` | `POST /api/customers/payments/batch` | 未実装 |
| `GET /api/customers/by-course/:courseId/invoices-amounts` | `GET /api/customers/by-course/[courseId]/invoices-amounts` | 未実装 |
| `GET /api/customers/by-course/:courseId/payments-sum` | `GET /api/customers/by-course/[courseId]/payments-sum` | 未実装 |
| `GET /api/customers/:id/ar-summary` | `GET /api/customers/[id]/ar-summary` | GET 実装（サマリー計算 + Supabase 集計） |

## 3. マスター／ユーティリティ

| 現行 Express | Next.js Route | 実装状況 |
|--------------|---------------|----------|
| `GET /api/masters/courses` | `GET /api/masters/courses` | Supabase から取得済み |
| `GET /api/masters/products` | `GET /api/masters/products` | 未実装 |
| `GET /api/masters/manufacturers` | `GET /api/masters/manufacturers` | 未実装 |
| `POST /api/masters/courses/renumber` | `POST /api/masters/courses/renumber` | 未実装 |

## 4. 今後の進め方

1. プレースホルダ（501）となっている Route Handler に対し、順次ロジックを移植する。  
2. バリデーションは `lib/validators/**`（未作成）に集約し、フロント側に返すエラーを統一。  
3. Supabase RPC 作成後、Route Handler は RPC 呼び出し＋結果整形の薄い層にする。  
4. Server Actions を併用する際は、API Route と重複しないよう責務を整理。  
5. 移植が完了した API から順に E2E テストを Playwright で追加予定。

---

更新ルール:
- 新規 Route Handler 追加時は本書に追記。
- 実装済みになったら「実装状況」を更新し、バリデーションやレスポンス仕様のリンクを付与。
- 大規模な仕様変更は Pull Request とセットでドキュメント反映すること。


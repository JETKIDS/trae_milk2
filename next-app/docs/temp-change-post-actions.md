# 臨時変更 API 後処理設計メモ

## 1. 目的

臨時変更（追加・本数変更・休配）の登録／更新／削除を行った後、フロントエンドで再取得すべきデータや実行すべき RPC を整理し、Next.js + Supabase 構成での一貫した更新フローを定義する。

---

## 2. データ更新の影響範囲

| 変更種別 | 主な影響箇所 |
|----------|--------------|
| `temporary_changes` | 顧客カレンダー、請求集計（当該月の請求金額、繰越額） |
| `delivery_patterns`（将来的に同時更新する場合） | カレンダー、請求集計 |

臨時変更は日単位での数量・休配情報を上書きするため、少なくとも以下を再評価する必要がある。

1. `GET /api/customers/[id]/calendar/[year]/[month]` の結果  
2. `rpc_update_customer_ledger(customer_id, year, month)` による請求・繰越再計算  
3. 月次請求ステータス（確定／未確定）  
4. 一括入金／請求書プレビューで使用するサマリー

---

## 3. 推奨フローフロー

1. `POST/PUT/DELETE /api/temporary-changes` 実行時に、該当年月の `rpc_update_customer_ledger` を呼び出して集計を更新する。  
   - Route Handler 内で自動的に呼び出されるため、フロントから明示的に再計算を行う必要はない。  
   - 更新で月をまたぐ場合は旧・新両方の年月に対して再計算を行っている。  
   - RPC 呼び出し結果をフロントに返すことで再取得せずに新しいサマリーを更新することも検討する。

2. フロントエンドでは、臨時変更 API の応答後に以下を再取得する:
   - 最新カレンダー: `GET /api/customers/[id]/calendar/[year]/[month]`
   - 請求状況／サマリー: `GET /api/customers/[id]/invoices/status?year=YYYY&month=MM` または専用のサマリー API（今後追加を検討）

3. キャッシュ戦略:
   - App Router の `revalidatePath` や `router.refresh()` を利用して RSC キャッシュを更新。  
   - Client Components では React Query などを利用する場合、該当クエリを無効化する。

---

## 4. 未実装のタスク

- [ ] `temporary-changes` Route Handler 内で `rpc_update_customer_ledger` を呼び出す（登録／更新／削除すべて）  
- [ ] カレンダー・サマリーの再取得を簡略化するユーティリティ（サーバーアクションやカスタムフック）を用意※
- [ ] 請求サマリー API（`GET /api/customers/[id]/ar-summary` 等）の移植と統合
- [ ] フロントエンドで API 応答に応じた UI 更新フローを整理（再フェッチ順序、ローディング表示など）

---

## 5. 残課題

- 複数の臨時変更が同月に対して連続登録されるケースでのパフォーマンス
- 請求確定状態との連携（確定解除 → 臨時変更 → 再確定の手順確認）
- Undo/Redo を導入する場合の差分記録方式（従来の Express 版 Undo API を Next.js に移植するか検討）

※ 詳細は `docs/frontend-refresh-plan.md` を参照予定。


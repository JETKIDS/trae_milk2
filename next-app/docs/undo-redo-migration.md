# Undo/Redo API 移植方針

## 1. 現状の把握

既存 Express 版では臨時変更・配達パターンなどの操作を `undo_stack` テーブルに記録し、直前の操作を API で取り消す仕組みを持っている（詳細なコードは `server/services/undoService.js` などを確認）。Next.js + Supabase へ移行する際には以下の課題がある。

- Supabase 上での履歴テーブル構成（RLS や multi-tenant 対応を含む）  
- Server Actions / Route Handlers との統合（Undo 実行時にどの RPC を呼ぶか）  
- UI での表示／操作フロー（Undo ボタンの有効化制御など）

---

## 2. テーブル・スキーマ設計案

```sql
create table undo_stack (
  id bigint generated always as identity primary key,
  customer_id bigint not null,
  action_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb
);
create index on undo_stack(customer_id, created_at desc);
```

- `payload` に再実行あるいは取り消しのために必要な差分データを保持。  
- Supabase RPC (`rpc_push_undo`, `rpc_pop_undo`) を利用して履歴を記録／取得。  
- `rpc_pop_undo` の戻り値をもとに、Route Handler 側で個別のロールバック処理を実行する。  
- 例: 臨時変更登録時に `payload` として「取り消し対象の臨時変更レコード」を保存しておき、Undo では削除する／復元する。

---

## 3. API / UI フロー

1. **操作実行**（臨時変更など）  
   - Route Handler 側で元の状態を `undo_stack` に保存。  
   - 操作後、フロントへ `undo_id` を返す。

2. **Undo 実行**  
   - `POST /api/undo` などの API を用意し、`undo_id` を指定して RPC を呼び出す。  
   - RPC 内で `undo_stack` を参照し、差分を適用／ロールバック。  
   - 成功後に `undo_stack` から該当レコードを削除。

3. **Redo（将来検討）**  
   - 別テーブル `redo_stack` を用意するか、`undo_stack` に方向を保持する。

---

## 4. Next.js 版での注意点

- Server Actions で操作 → Undo Stack への記録までまとめて行う場合、トランザクション整合性を確保する必要がある。  
- Supabase RPC では複数テーブル更新が必要になるため、`pg` 上でのトランザクションを組む。  
- Undo 操作の権限管理（誰が取り消し可能か）を検討。RLS を使用する場合は `auth.uid()` の扱いを整理する。

### 4-1. マスター操作の Undo 対応状況（2025-11-11 更新）

- Server Actions (`masters/actions.ts`) で下記イベントの履歴を自動記録するロジックを追加。
  - `staff_create` / `staff_delete`
  - `manufacturer_create` / `manufacturer_delete`
  - `company_update`
  - `institution_update`
- 記録フォーマットは Route Handler `api/masters/undo` が期待する構造（`{ staff: ... }`, `{ deleted: ... }`, `{ before: ... }` 等）に統一。
- すべて Supabase RPC `rpc_push_master_undo` を経由し、`masters` ページの Server Action から一貫して呼び出す。
- これにより、Undo 実行時は `api/masters/undo` で復元対象レコードを判別でき、削除→復元や更新→ロールバックが成立する。

残タスク:

- マスター更新系（スタッフ・メーカーの編集、コース CRUD 等）に対する Undo ペイロード定義と実装。
- UI 側での「取り消し」操作導線の追加。
- 履歴上限数／保持期間の運用ルール整理。

---

## 5. 未決事項

- Supabase 側で Undo 用の RPC をどこまで実装するか（例: `temporary_changes`, `delivery_patterns`, `payments` など操作単位で用意）  
- Undo 操作の履歴保持期間・容量制限  
- UI 側での Undo 可能ステータス管理（操作直後のみに限定するか、複数ステップの Undo を許可するか）

---

## 6. 次のステップ

- 既存 Express 版の Undo API を確認し、差分データの構造を洗い出す。  
- Supabase スキーマ（`undo_stack`）を `schema.sql` に追加。  
- `rpc_undo_*` 系の関数を定義し、Route Handler から呼び出す流れを実装。  
- UI 側で Undo ボタン／ショートカットの実装方針を検討。
- マスター管理用 `rpc_push_master_undo` / `rpc_pop_master_undo` を活用し、残りのマスター種別にも適用範囲を拡張する。


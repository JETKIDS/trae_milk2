# マスター管理 API 移植計画

## 1. 対象と現状

旧 Express (`server/routes/masters.js`) で扱っていた主なエンドポイント:

- 配達コース (`/courses`) : 一覧・詳細・登録・更新・削除・ID再割当
- 配達スタッフ (`/staff`) ：一覧・登録・更新・削除・コース割当
- メーカー (`/manufacturers`) ：一覧・削除
- 会社情報 (`/company`)
- 収納機関 (`/institution` / `/institutions`)

Supabase 移行後はこれらを Next.js Route Handler + Supabase RPC/クエリで再実装する。

---

## 2. 優先度・順序（案）

1. コース (`/masters/courses`) : フロントの依存が多く、ID 体系（001〜）を維持する必要あり  
2. スタッフ (`/masters/staff`) : コース割当との連携が重要  
3. メーカー・会社・収納機関 : 更新頻度は低いが設定情報として必要
- 配達スタッフ (`/masters/staff`) : 一覧・登録・更新・削除・コース割当

### スタッフ管理 API メモ

| 操作 | エンドポイント案 | 内容 |
|------|-----------------|------|
| スタッフ一覧 | `GET /api/masters/staff` | staff_name, phone, email, notes, 割当コースの簡易情報 |
| スタッフ登録 | `POST /api/masters/staff` | 必須: staff_name。任意: phone/email/notes/course_id |
| スタッフ更新 | `PUT /api/masters/staff/[id]` | コース再割当を含む更新 |
| スタッフ削除 | `DELETE /api/masters/staff/[id]` | 担当顧客が存在する場合の扱いに注意 |

- 追加列 `notes` を `delivery_staff` に導入（メモ等用）。  
- `customers` の `staff_id` を参照するため、削除時チェックが必要。  
- **再割当ルール案**: 削除前に対象スタッフが担当する顧客を別スタッフへ移行するワークフローを検討（例: 削除 API に `transfer_to_staff_id` パラメータを追加し、指定がない場合は削除不可）。  
- スタッフ削除を頻繁に行う場合、ソフトデリート（`is_active` フラグ）で運用する選択肢も検討。  
- Undo 対応を後続フェーズで検討。

### メーカー管理 API メモ

| 操作 | エンドポイント案 | 内容 |
|------|-----------------|------|
| メーカー一覧 | `GET /api/masters/manufacturers` | manufacturer_name, contact_info 等 |
| メーカー登録 | `POST /api/masters/manufacturers` | 必須: manufacturer_name |
| メーカー削除 | `DELETE /api/masters/manufacturers/[id]` | 商品(`products`)が紐づいている場合の扱いに注意 |

- 旧実装では削除のみ実装されていたが、登録／更新にも対応できるようにする。  
- 商品テーブル (`products.manufacturer_id`) との参照整合性に留意し、削除時チェックを行う。  
- 将来的に連絡先や備考を追加する場合に備え、テーブルの柔軟性を確保する。

### 会社情報 API メモ

| 操作 | エンドポイント案 | 内容 |
|------|-----------------|------|
| 会社情報取得 | `GET /api/masters/company` | 単一レコード（company_info）を返却、存在しない場合はデフォルト値 |
| 会社情報更新 | `POST /api/masters/company` | company_name（必須）・住所・電話・半角カナ（30 文字以内）など |

- 半角カナバリデーション（旧実装では正規表現でチェック）。  
- 列追加などのマイグレーションは Supabase 側で管理し、API 内で `ALTER TABLE` を行わない。  
- Undo 対応（変更履歴の保存）を検討。  

### 収納機関 API メモ

| 操作 | エンドポイント案 | 内容 |
|------|-----------------|------|
| 収納機関取得 | `GET /api/masters/institution` | 単一レコード（institution_info）を返却、存在しない場合はデフォルト値 |
| 収納機関更新 | `POST /api/masters/institution` | 金融機関コード（7桁）・委託者名（半角カナ）などのバリデーションを実施 |

- 旧実装では半角カナや数字のみなどの厳格なチェックを実装。Supabase 移行後も同様に行う。  
- 今後複数の収納機関を扱う場合に備えて、テーブル設計を柔軟に保つ（現在は単一レコード運用）。  
- 更新後の再取得フローや Undo 対応を検討。

---

## 3. 実装ポイント

- **ID 割り当てロジック** : コース ID のリナンバリング（001〜）やユニーク制約を Supabase 側で再現。  
- **参照整合性** : コース削除時に顧客が紐づいている場合の扱い。必要に応じて論理削除／RLS を検討。  
- **Undo 対応** : 後続フェーズで必要なら `undo_stack` に設定変更の履歴を残す。  
- **認証・権限** : 管理系 API のため、権限管理を導入する場合の想定を記録。

---

## 4. 次ステップ

- Supabase スキーマ (`schema.sql`) に不足する列や制約がないかを確認。  
- 既存フロント実装（設定画面）で使用しているデータ構造を洗い出し、新 API のレスポンスに反映。  
- Route Handler の雛形（`app/api/masters/courses/route.ts` 等）を用意し、機能単位で移植を進める。


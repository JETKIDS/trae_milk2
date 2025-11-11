# マスター設定画面 Next.js 統合メモ

旧フロント（`client/src/pages/MasterManagement.tsx`）で実装されているマスター設定 UI を、Next.js + 新 API に接続する際の手順と考慮事項を整理する。

---

## 1. 対象コンポーネント

- `client/src/pages/MasterManagement.tsx`
  - スタッフ、メーカー、会社情報、収納機関のタブを持つ
  - `apiClient` 経由で `/api/masters/**` エンドポイントを呼び出し
  - 今後 Next.js 版へ移植時は下記 Route Handler を利用
    - `/api/masters/staff`
    - `/api/masters/manufacturers`
    - `/api/masters/company`
    - `/api/masters/institution`
    - ※複数収納機関を扱う場合は追加の `/api/masters/institutions`（未実装）を検討

---

## 2. Next.js での実装方針

1. **ページ構成**
   - App Router で `app/(dashboard)/masters/page.tsx` 等を新設し、RSC + Client Component の分離を検討
   - 各タブは Client Component とし、データ取得を Server Action または `useEffect` + fetch で実装

2. **データ取得**
   - 初期表示: `GET` Route Handler を server-side で呼び出し、初期値を渡す
   - 保存操作: Server Action を利用し `POST/PUT/DELETE` を呼び出し、成功後 `revalidatePath('/masters')`

3. **エラーハンドリング**
   - API からのエラーメッセージを Snackbar などで表示
   - バリデーションはフロント・バックの両方で実施（半角カナ、数字のみ等）

4. **Undo 対応（任意）**
   - 会社情報・収納機関なども `undo_stack` に履歴を残す場合は、操作後の Undo ボタンを提供する
   - Server Action → Route Handler → RPC の流れで Undo を統合

---

## 3. TODO

- [ ] Next.js 側に `masters` ページを作成し、既存コンポーネントを移植または再構築
- [ ] Server Action 経由で新 API を呼び出す処理を実装（例：`saveStaff`, `saveCompany` 等）
- [ ] 収納機関の複数管理が必要であれば `/api/masters/institutions` を追加実装
- [ ] Undo 対応を導入するか方針を決め、必要なら UI/Server Action を拡張

---

## 4. 進捗メモ（2025-11）

- `app/masters/page.tsx` を追加し、Supabase から初期データを取得するサーバーコンポーネントを実装。  
- `MastersPageClient` でスタッフ／メーカー／会社情報／収納機関の編集 UI を再構築し、新 API に接続。  
- Undo ボタンを各タブに追加し、`/api/masters/undo` 経由で直近の操作を取り消し可能にした。  
- `globals.css` に専用スタイルを追加し、既存レイアウトと調和させた。


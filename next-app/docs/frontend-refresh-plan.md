# フロントエンド再取得フロー設計メモ

## 1. 目的

臨時変更・請求確定・入金登録などの操作後に必要な再取得ステップを整理し、Next.js App Router（Server Actions + Client Components）の構成でどのようにデータを更新するかを定義する。

---

## 2. 再取得対象

| 変更操作 | 再取得する主なデータ | 実行タイミング |
|----------|---------------------|----------------|
| 臨時変更（POST/PUT/DELETE） | - `GET /api/customers/[id]/calendar/[year]/[month]`<br>- `GET /api/customers/[id]/invoices/status`（もしくはサマリー API） | API 応答後 |
| 入金登録（POST /payments） | - 請求ステータス／サマリー<br>- 一括入金画面のトータル | API 応答後 |
| 請求確定／解除 | - カレンダーの編集ロック状態（背景色等）<br>- サマリー／繰越額<br>- 一括入金リスト | API 応答後 |

---

## 3. 実装パターン

### 3.1 Server Actions（推奨）

1. React Server Component からフォームやボタンを操作 → Server Action を呼び出す。
2. Server Action で API 呼び出し（または直接 DB / Supabase RPC）を実行。
3. 成功時に `revalidatePath(`/customers/${id}?year=YYYY&month=MM`)` などを実行して該当ページを再検証。
4. 必要に応じて `redirect` または結果を返して Client Component に渡す。

### 3.2 Client Components + fetch

1. `useState` + `useEffect`／React Query などを利用して API 呼び出しを行う。
2. 登録後に `router.refresh()` で現在のページ全体を再検証。
3. あるいは React Query の `invalidateQueries` で対象クエリを個別に無効化。

---

## 4. 推奨構成

- **Server Actions** をメインに利用し、成功時に `revalidatePath` を呼び出す。  
  - 複数パスを再検証する必要がある場合は `Promise.all` で複数の `revalidatePath` を実行。  
  - 例：臨時変更 → 顧客詳細ページ `/customers/[id]?year=YYYY&month=MM` と、一括入金ページ `/collections?month=YYYY-MM` を再検証。
- **Client Components** では `useTransition` を利用し、処理中にローディング状態を表示。  
- HTTP レスポンスデータに最新のサマリーを含めることができれば、再取得を待たずに UI を更新可能（サマリー API を併用）。

---

## 5. 次のステップ

- Server Action 実装テンプレートを用意（例：`app/customers/[id]/actions.ts`）。  
- サマリー API（請求状態・繰越）を実装し、臨時変更・入金後にまとめて取得できるようにする。  
- undo/redo を導入する場合、Server Action 内で操作履歴を記録してロールバックする仕組みを検討。


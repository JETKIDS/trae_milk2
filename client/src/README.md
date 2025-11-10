# 牛乳配達顧客管理システム フロントエンドガイド

最終更新: 2025-11-10

本ドキュメントは、React/TypeScript で構築されたフロントエンドの現状仕様・構成・開発手順を整理したものです。サーバーとの連携仕様や利用可能な画面を把握するために参照してください。

---

## 1. 主要画面と機能

### 1.1 顧客詳細 (`CustomerDetail`)
- 月次カレンダーで商品×日付の配達数量を表示
- カレンダーセルから以下の操作が可能
  - 臨時の本数変更、商品追加、休配／休配解除
  - 配達パターン編集ダイアログの起動
  - 解約／解約取り消し
- Undo スタックを備え、直前の操作を取り消し可能
- 月次集計カードで商品別数量・金額・繰越を表示
- 右サイドバーで下記操作
  - 請求確定／取消
  - 当月入金の登録（集金／口座振替）
  - 入金履歴・口座情報の確認
  - 単価変更、顧客情報編集

### 1.2 請求書プレビュー (`InvoicePreview`)
- 顧客単位で 2up 帳票レイアウトを生成
- 前月請求／当月入金／過不足を明示表示
- 当月カレンダーを前半・後半の 2 枚で表示し印刷に対応

### 1.3 一括入金 (`BulkCollection`)
- 入金対象月とコースを選択後、「読み込み」で前月請求額と当月入金額を取得
- 読み込み中はスピナーを表示
- 自動入金（残額での一括登録）と手動金額登録の両方に対応
- 全コース表示とコース別表示を切り替え可能

### 1.4 その他の主要ページ
- 顧客一覧・配達リスト・商品マスター等の管理画面を用意
- 共通エラーバナー (`ErrorAlert`) とエラーバウンダリ (`ErrorBoundary`) を実装

---

## 2. 技術スタック

| 分類 | 採用技術 |
|------|-----------|
| UI | React 18, Material UI, react-router-dom |
| 型 | TypeScript |
| 状態管理 | React Hooks（ローカル状態＋カスタムフック） |
| 日付処理 | moment.js |
| HTTP | axios（`utils/apiClient.ts` 経由） |
| テスト | Jest, React Testing Library |
| 最適化 | react-window（仮想スクロール）、カスタムキャッシュフック |

---

## 3. ディレクトリ構成（抜粋）

```
client/src/
├── components/
│   ├── CustomerCalendar.tsx
│   ├── CustomerActionsSidebar.tsx
│   ├── DeliveryPatternManager.tsx
│   ├── TemporaryChangeManager.tsx
│   ├── MonthlySummary.tsx
│   └── UndoManager.tsx
├── hooks/
│   ├── useCustomerData.ts
│   ├── useCalendarData.ts
│   ├── useProductMasters.ts
│   └── useErrorHandler.ts
├── pages/
│   ├── CustomerDetail.tsx
│   ├── InvoicePreview.tsx
│   ├── BulkCollection.tsx
│   └── 他管理画面
├── types/
│   ├── customer.ts
│   ├── customerDetail.ts
│   └── ledger.ts
└── utils/
    ├── apiClient.ts
    ├── date.ts
    ├── performance.ts
    └── validation.ts
```

---

## 4. 主要なカスタムフック

| フック | 役割 |
|--------|------|
| `useCustomerData` | 顧客情報・配達パターンの取得と更新を担当 |
| `useCalendarData` | 月次カレンダーと臨時変更の取得・反映 |
| `useProductMasters` | 商品マスタの取得と名称→税区分のマッピング |
| `useErrorHandler` | API 呼び出し失敗時の通知・リトライ誘導 |
| `useInfiniteScroll` / `useOptimizedData` | 顧客一覧の仮想スクロール処理 |

---

## 5. 開発者向け手順

### 5.1 セットアップ
```bash
cd client
npm install
```

### 5.2 開発サーバー起動
```bash
# リポジトリルート
npm run dev       # サーバー + クライアント同時起動
```
- フロントエンド単体で起動する場合は `npm run client` を使用

### 5.3 テスト
```bash
cd client
npm test
```
- カバレッジレポート: `npm run test:coverage`

### 5.4 ビルド
```bash
cd client
npm run build
```
- 出力は `client/build` 配下に生成

---

## 6. エラーハンドリング/ローディング指針
- API 呼び出し中はボタン無効化＋スピナー表示を基本とする
- エラーは `useErrorHandler` で集約し、ユーザーに文言を提示
- Undo 操作が必要なケースでは `UndoManager` 経由で履歴を登録

---

## 7. コーディング規約メモ
- コンポーネントは原則 Functional Component + Hooks
- 型定義は `types/` に集約し、API レスポンスと同期させる
- 日付フォーマットは moment で統一（`utils/date.ts` に共通処理）
- 7 桁 custom_id 表示を徹底し、内部 ID は表示しない

---

## 8. 今後の改善アイデア
- グローバル状態管理（Redux Toolkit / Zustand）の導入検討
- ARIA 属性の追加・キーボード操作対応などアクセシビリティ向上
- 多言語対応（react-i18next）
- PWA 対応によるオフライン閲覧

---

疑問点・仕様変更がある場合は、`requirements.md` と合わせて更新し、バックエンド担当と調整してください。
